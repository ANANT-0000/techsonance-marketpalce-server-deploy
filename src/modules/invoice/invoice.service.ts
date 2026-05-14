// src/modules/invoice/invoice.service.ts
import {
  Injectable,
  Inject,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import { and, eq, inArray } from 'drizzle-orm';
import {
  orders,
  invoices,
  gst_registrations,
  company_document_config,
  company_branding,
  company_legal_profile,
} from '../../drizzle/schema';
import { UploadToCloudService } from '../../utils/upload-to-cloud/upload-to-cloud.service';
import { randomUUID } from 'crypto';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { CompanyService } from '../company/company.service';
import { InvoiceTemplateRegistry } from './template.registry';
import {
  StandardizedInvoicePayload,
  // InvoiceAddress,
} from './interfaces/invoice.interface';

// ─── Strict Nested Drizzle Interfaces ──────────────────────────────────────────

interface DbAddress {
  address_line_1: string;
  city: string;
  state: string;
  postal_code: string;
}

interface Warehouse {
  id: string;
  warehouse_name: string;
  address: DbAddress | null;
}

interface OrderItem {
  id: string;
  quantity: number;
  price: string; // Drizzle returns decimals as strings
  company_id: string;
  variant: {
    product: {
      name: string;
      description: string | null;
      vendor: {
        store_name: string;
      } | null;
    };
    inventory: {
      warehouse: Warehouse;
    } | null;
  } | null;
}

interface OrderWithRelations {
  id: string;
  company_id: string;
  customer: {
    first_name: string | null;
    last_name: string | null;
    phone_number: string | null;
    email: string;
  };
  address: DbAddress;
  items: OrderItem[];
}

interface WarehouseGroup {
  warehouse: Warehouse;
  items: OrderItem[];
}

// ─── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class InvoiceService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly uploadToCloudService: UploadToCloudService,
    private readonly companyService: CompanyService,
    private readonly templateRegistry: InvoiceTemplateRegistry,
  ) {}

  async createInvoice(orderId: string): Promise<void> {
    const orderData = (await this.db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      with: {
        customer: true,
        address: true,
        items: {
          with: {
            variant: {
              with: {
                product: { with: { vendor: true } },
                inventory: { with: { warehouse: { with: { address: true } } } },
              },
            },
          },
        },
      },
    })) as OrderWithRelations | undefined;

    if (!orderData) throw new NotFoundException(`Order ${orderId} not found`);
    if (!orderData.items.length)
      throw new NotFoundException(`Order ${orderId} has no items`);

    const companyId = orderData.company_id;

    // Fetch Configurations
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

    const { assigned, unresolved } = this.groupItemsByWarehouse(
      orderData.items,
    );

    if (assigned.size === 0) {
      throw new InternalServerErrorException(
        `No valid warehouses found for order ${orderId}`,
      );
    }

    // Prepare shared info
    const customerName =
      [orderData.customer.first_name, orderData.customer.last_name]
        .filter(Boolean)
        .join(' ') || 'Customer';
    const shippingAddress: any = {
      addressLine1: orderData.address.address_line_1,
      city: orderData.address.city,
      state: orderData.address.state,
      pincode: orderData.address.postal_code,
    };

    const vendorName = this.resolveVendorName(assigned);

    // Generate in parallel
    const results = await Promise.allSettled(
      Array.from(assigned.values()).map((group) =>
        this.generateInvoiceForGroup(
          orderData.id,
          group,
          {
            name: customerName,
            phone: orderData.customer.phone_number ?? 'N/A',
            email: orderData.customer.email,
            address: shippingAddress,
          },
          { name: vendorName, gst: gstDetails?.gst_number ?? 'N/A' },
          {
            config: config ?? null,
            branding: branding ?? null,
            legal: legal ?? null,
          },
        ),
      ),
    );

    const invoiceInsertions: (typeof invoices.$inferInsert)[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        invoiceInsertions.push(...result.value);
      } else {
        console.error(
          `[InvoiceService] Warehouse invoice failed for order ${orderId}:`,
          result.reason,
        );
      }
    }

    if (invoiceInsertions.length === 0) {
      throw new InternalServerErrorException(
        `All invoice generations failed for order ${orderId}.`,
      );
    }

    await this.db.insert(invoices).values(invoiceInsertions);
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

  private groupItemsByWarehouse(items: OrderItem[]): {
    assigned: Map<string, WarehouseGroup>;
    unresolved: OrderItem[];
  } {
    const assigned = new Map<string, WarehouseGroup>();
    const unresolved: OrderItem[] = [];

    for (const item of items) {
      const warehouse = item.variant?.inventory?.warehouse ?? null;
      if (!warehouse) {
        unresolved.push(item);
        continue;
      }
      const existing = assigned.get(warehouse.id);
      if (existing) {
        existing.items.push(item);
      } else {
        assigned.set(warehouse.id, { warehouse, items: [item] });
      }
    }
    return { assigned, unresolved };
  }

  private async generateInvoiceForGroup(
    orderId: string,
    group: WarehouseGroup,
    customerData: {
      name: string;
      phone: string;
      email: string;
      address: any;
    },
    vendorData: { name: string; gst: string },
    companyContext: { config: any; branding: any; legal: any },
  ): Promise<(typeof invoices.$inferInsert)[]> {
    const { config, branding, legal } = companyContext;
    const invoiceNumber = this.buildInvoiceNumber(group.warehouse.id);
    const templateName =
      config?.default_invoice_template?.template_name || 'standard-gst';

    let subTotal = 0;
    let totalTax = 0;

    // Strict item mapping
    const itemsPayload = group.items.map((item) => {
      const price = Number(item.price);
      const qty = item.quantity;
      const taxableValue = price * qty;

      // TODO: Connect this to your actual tax tables. Defaults used here to prevent NaN errors.
      const taxRate = 0;
      const taxAmount = 0;
      const totalAmount = taxableValue + taxAmount;

      subTotal += taxableValue;
      totalTax += taxAmount;

      return {
        name: item.variant?.product?.name ?? 'Unknown Product',
        description: item.variant?.product?.description ?? '',
        hsnCode: '', // Map when added to schema
        quantity: qty,
        unitPrice: price,
        taxableValue: taxableValue,
        taxRate: taxRate,
        taxAmount: taxAmount,
        totalAmount: totalAmount,
      };
    });

    const warehouseAddress: any = group.warehouse.address
      ? {
          addressLine1: group.warehouse.address.address_line_1,
          city: group.warehouse.address.city,
          state: group.warehouse.address.state,
          pincode: group.warehouse.address.postal_code,
        }
      : {
          addressLine1: group.warehouse.warehouse_name,
          city: '',
          state: '',
          pincode: '',
        };

    // Format the payload exactly to the strict interface
    const payload: StandardizedInvoicePayload = {
      meta: {
        invoiceNumber,
        invoiceDate: new Date(), // Safe serializable date
      },
      branding: {
        logoUrl: branding?.logo_url || undefined,
        primaryColor: branding?.primary_color || '#000000',
        watermarkUrl: branding?.watermark_url || undefined,
      },
      legal: {
        legalName: legal?.legal_name || vendorData.name,
        tradeName: legal?.trade_name || vendorData.name,
        supportEmail: legal?.support_email || '',
        supportPhone: legal?.support_phone || '',
        taxIds: [{ key: 'GSTIN', value: vendorData.gst }],
      },
      customer: {
        name: customerData.name,
        phone: customerData.phone,
        email: customerData.email,
        shippingAddress: customerData.address,
        billingAddress: customerData.address, // Usually identical unless split in checkout
      },
      warehouse: {
        name: group.warehouse.warehouse_name,
        address: warehouseAddress,
      },
      items: itemsPayload,
      totals: {
        subTotal,
        totalTax,
        grandTotal: subTotal + totalTax,
        currency: config?.default_currency || 'INR',
      },
      footer: {
        termsAndConditions: config?.invoice_terms_and_conditions || undefined,
        notes: config?.invoice_footer_text || undefined,
        signatoryName: config?.signatory_name || undefined,
        signatorySignatureUrl: config?.signatory_signature_url || undefined,
      },
    };

    // Render using Puppeteer Template
    const template = this.templateRegistry.getTemplate(templateName);
    const pdfBuffer = await template.render(payload);

    // Upload to Cloudinary
    const invoiceUrl: string = await this.uploadToCloudService.uploadInvoice(
      pdfBuffer,
      `invoice_${orderId}_${group.warehouse.id}`,
    );

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

  // Helpers
  private buildInvoiceNumber(warehouseId: string): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const unique = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
    const whSuffix = warehouseId.replace(/-/g, '').slice(0, 4).toUpperCase();
    return `INV-${date}-${unique}-${whSuffix}`;
  }

  private resolveVendorName(assigned: Map<string, WarehouseGroup>): string {
    for (const group of assigned.values()) {
      for (const item of group.items) {
        if (item.variant?.product?.vendor?.store_name) {
          return item.variant.product.vendor.store_name;
        }
      }
    }
    return 'Vendor Store';
  }
}
