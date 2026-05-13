import {
  Injectable,
  Inject,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import { and, eq, inArray } from 'drizzle-orm';

import { UploadToCloudService } from '../../utils/upload-to-cloud/upload-to-cloud.service';
import { randomUUID } from 'crypto';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { CompanyService } from '../company/company.service';

// --- New Modular Imports ---
import { InvoiceTemplateRegistry } from './template.registry';
import {
  CompanyContext,
  GroupingResult,
  MappedOrderInfo,
  MappedVendorInfo,
  OrderItem,
  OrderWithRelations,
  StandardizedInvoicePayload,
  WarehouseGroup,
} from './interfaces/invoice.interface';
import {
  gst_registrations,
  invoices,
  orders,
  company_branding,
  company_document_config,
  company_legal_profile,
} from '../../drizzle/schema';

@Injectable()
export class InvoiceService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly uploadToCloudService: UploadToCloudService,
    private readonly companyService: CompanyService,
    private readonly templateRegistry: InvoiceTemplateRegistry,
  ) {}

  async createInvoice(orderId: string): Promise<void> {
    // ── Step 1: Fetch order + all deep relations ───────────────────────────────
    const orderData = (await this.db.query.orders
      .findFirst({
        where: eq(orders.id, orderId),
        with: {
          customer: true,
          address: true,
          items: {
            with: {
              variant: {
                with: {
                  product: {
                    with: {
                      vendor: {
                        with: { user: true },
                      },
                    },
                  },
                  inventory: {
                    with: {
                      warehouse: { with: { address: true } },
                    },
                  },
                },
              },
            },
          },
        },
      })
      .catch((err) => {
        console.error(
          `[InvoiceService] Failed to fetch order ${orderId}:`,
          err,
        );
        throw new InternalServerErrorException(
          `Failed to fetch order ${orderId}.`,
          { cause: err },
        );
      })) as OrderWithRelations | undefined;

    if (!orderData) throw new NotFoundException(`Order ${orderId} not found`);
    if (!orderData.items.length)
      throw new NotFoundException(`Order ${orderId} has no items`);

    const companyId = orderData.company_id;

    // ── Step 2: Fetch Identity, Legal & Config Data ONCE per order ─────────────
    const [gstDetails, config, branding, legal] = await Promise.all([
      this.db.query.gst_registrations.findFirst({
        where: eq(gst_registrations.company_id, companyId),
      }),

      this.db.query.company_document_config.findFirst({
        where: eq(company_document_config.company_id, companyId),
        with: { default_invoice_template: true },
      }),

      this.db.query.company_branding.findFirst({
        where: eq(company_branding.company_id, companyId),
      }),

      this.db.query.company_legal_profile.findFirst({
        where: eq(company_legal_profile.company_id, companyId),
      }),
    ]);

    // ── Step 3: Group items by warehouse ───────────────────────────────────────
    const { assigned, unresolved } = this.groupItemsByWarehouse(
      orderData.items,
    );

    if (unresolved.length > 0) {
      console.warn(
        `[InvoiceService] Order ${orderId}: ${unresolved.length} item(s) skipped (no warehouse).`,
      );
    }

    if (assigned.size === 0) {
      throw new InternalServerErrorException(
        `No valid warehouses found for order ${orderId}`,
      );
    }

    // ── Step 4: Build shared info objects ──────────────────────────────────────
    const mappedOrderInfo: MappedOrderInfo = {
      id: orderData.id,
      customerName:
        [orderData.customer.first_name, orderData.customer.last_name]
          .filter(Boolean)
          .join(' ') || 'Customer',
      customerPhone: orderData.customer.phone_number ?? 'N/A',
      shippingAddress: {
        addressLine1: orderData.address.address_line_1,
        city: orderData.address.city,
        state: orderData.address.state,
        pincode: orderData.address.postal_code,
      },
    };

    const mappedVendorInfo: MappedVendorInfo = {
      companyName: this.resolveVendorName(assigned),
      // @ts-ignore - GST details might be null, handle gracefully
      gstNumber: (gstDetails && gstDetails[0]?.gst_number) || 'N/A',
      mobileNumber:
        orderData.items[0].variant?.product?.vendor?.user?.phone_number ??
        'N/A',
      email: orderData.customer.email,
    };

    // ── Step 5: Generate all warehouse invoices IN PARALLEL ────────────────────
    const results = await Promise.allSettled(
      Array.from(assigned.values()).map((group) =>
        this.generateInvoiceForGroup(
          orderData.id,
          group,
          mappedOrderInfo,
          mappedVendorInfo,
          {
            config: config || null,
            branding: branding || null,
            legal: legal || null,
          },
        ),
      ),
    );

    // ── Step 6: Collect successes, surface failures ────────────────────────────
    const invoiceInsertions: (typeof invoices.$inferInsert)[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (Array.isArray(result.value)) {
          invoiceInsertions.push(...result.value);
        } else {
          invoiceInsertions.push(result.value);
        }
      } else {
        console.error(
          `[InvoiceService] Warehouse invoice generation failed for order ${orderId}:`,
          result.reason,
        );
      }
    }

    if (invoiceInsertions.length === 0) {
      throw new InternalServerErrorException(
        `All invoice generations failed for order ${orderId}.`,
      );
    }

    // ── Step 7: Single bulk insert ─────────────────────────────────────────────
    await this.db
      .insert(invoices)
      .values(invoiceInsertions)
      .catch((err) => {
        console.error(
          `[InvoiceService] Failed to insert invoice records for order ${orderId}:`,
          err,
        );
        throw new InternalServerErrorException(
          `Failed to save invoice records for order ${orderId}.`,
          { cause: err },
        );
      });

    console.log(
      `[InvoiceService] Successfully generated ${invoiceInsertions.length} invoice(s) for order ${orderId}.`,
    );
  }

  async getBulkInvoiceUrls(domain: string, orderIds: string[]) {
    const filteredDomain = domainExtractor(domain);
    const companyId = await this.companyService.find(filteredDomain);

    return await this.db
      .select({
        invoice_url: invoices.invoice_url,
        invoice_number: invoices.invoice_number,
        order_id: invoices.order_id,
      })
      .from(invoices)
      .where(
        and(
          inArray(invoices.order_id, orderIds),
          eq(invoices.company_id, companyId),
        ),
      );
  }

  private groupItemsByWarehouse(items: OrderItem[]): GroupingResult {
    const assigned = new Map<string, WarehouseGroup>();
    const unresolved: OrderItem[] = [];

    for (const item of items) {
      const warehouse = item.variant?.inventory?.warehouse ?? null;
      if (!warehouse) {
        unresolved.push(item);
        continue;
      }
      const existing = assigned.get(warehouse.id);
      if (existing) existing.items.push(item);
      else assigned.set(warehouse.id, { warehouse, items: [item] });
    }
    return { assigned, unresolved };
  }

  // ─── Refactored: Generate one invoice for a warehouse group ────────────────
  private async generateInvoiceForGroup(
    orderId: string,
    group: WarehouseGroup,
    orderInfo: MappedOrderInfo,
    vendorInfo: MappedVendorInfo,
    companyContext: CompanyContext,
  ): Promise<(typeof invoices.$inferInsert)[]> {
    const { config, branding, legal } = companyContext;
    const invoiceNumber = this.buildInvoiceNumber(group.warehouse.id);

    // 1. Determine Template Name from Config (Fallback to 'standard-gst')
    const templateName =
      config?.default_invoice_template?.template_name || 'standard-gst';

    // 2. Map Items & Calculate Totals
    let subTotal = 0;
    const itemsPayload = group.items.map((item) => {
      const price = Number(item.price);
      const totalAmount = price * item.quantity;
      subTotal += totalAmount;

      return {
        name: item.variant?.product?.name ?? 'Unknown Product',
        quantity: item.quantity,
        unitPrice: price,
        taxAmount: 0,
        taxRate: 0,
        totalAmount: totalAmount,
      };
    });

    // 3. Construct the Standardized Payload exactly matching the Template Interface
    const payload: StandardizedInvoicePayload = {
      meta: {
        invoiceNumber,
        invoiceDate: new Date(),
      },
      branding: {
        logoUrl: branding?.logo_url,
        primaryColor: branding?.primary_color || '#000000',
        watermarkUrl: branding?.watermark_url || null,
      },
      legal: {
        legalName: legal?.legal_name || vendorInfo.companyName,
        tradeName: legal?.trade_name || vendorInfo.companyName,
        supportEmail: legal?.support_email || vendorInfo.email,
        supportPhone: legal?.support_phone || vendorInfo.mobileNumber,
        taxIds: [{ key: 'GSTIN', value: vendorInfo.gstNumber }], // Simplified - wire up actual compliance array later
      },
      customer: {
        name: orderInfo.customerName,
        phone: orderInfo.customerPhone,
        shippingAddress: `${orderInfo.shippingAddress.addressLine1}, ${orderInfo.shippingAddress.city}, ${orderInfo.shippingAddress.state} - ${orderInfo.shippingAddress.pincode}`,
        billingAddress: `${orderInfo.shippingAddress.addressLine1}, ${orderInfo.shippingAddress.city}, ${orderInfo.shippingAddress.state} - ${orderInfo.shippingAddress.pincode}`,
      },
      items: itemsPayload,
      totals: {
        subTotal,
        totalTax: 0,
        grandTotal: subTotal,
        currency: config?.default_currency || 'INR',
      },
      footer: {
        termsAndConditions:
          config?.invoice_terms_and_conditions ||
          'Thank you for your business!',
        notes: config?.invoice_footer_text || null,
        signatoryName: config?.signatory_name || 'Authorized Signatory',
      },
    };

    // 4. Retrieve Template from Registry & Render PDF
    const template = this.templateRegistry.getTemplate(templateName);
    const pdfBuffer = await template.render(payload);

    // 5. Upload to Cloudinary
    const invoiceUrl: string = await this.uploadToCloudService.uploadInvoice(
      pdfBuffer,
      `invoice_${orderId}_${group.warehouse.id}`,
    );

    // 6. Return DB Insert Object
    return [
      {
        invoice_number: invoiceNumber,
        invoice_url: invoiceUrl,
        order_id: orderId,
        order_item_id: group.items[0].id,
        company_id: group.items[0].company_id,
      },
    ];
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────
  private buildInvoiceNumber(warehouseId: string): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const unique = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
    const whSuffix = warehouseId.replace(/-/g, '').slice(0, 4).toUpperCase();
    return `INV-${date}-${unique}-${whSuffix}`;
  }

  private resolveVendorName(assigned: Map<string, WarehouseGroup>): string {
    for (const group of assigned.values()) {
      for (const item of group.items) {
        const name = item.variant?.product?.vendor?.store_name;
        if (name) return name;
      }
    }
    return 'Vendor Store';
  }
}
