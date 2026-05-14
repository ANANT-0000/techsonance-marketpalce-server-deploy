import {
  Injectable,
  Inject,
  InternalServerErrorException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';

import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import { invoices } from '../../drizzle/schema';
import { UploadToCloudService } from '../../utils/upload-to-cloud/upload-to-cloud.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { CompanyService } from '../company/company.service';

import { InvoiceTemplateRegistry } from './template.registry';
import { InvoicePayloadBuilderService } from './invoice-payload-builder.service';
import {
  MappedOrderInfo,
  MappedVendorInfo,
  WarehouseGroup,
  CompanyContext,
} from './interfaces/invoice.interface';

/**
 * InvoiceService — orchestrator only.
 *
 * Responsibilities:
 *  1. Orchestrate DB fetching via InvoicePayloadBuilderService
 *  2. Select the right template via InvoiceTemplateRegistry
 *  3. Call template.render() with the standardised payload
 *  4. Upload the resulting PDF buffer to Cloudinary
 *  5. Persist the invoice record to the DB
 */
@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly uploadService: UploadToCloudService,
    private readonly companyService: CompanyService,
    private readonly templateRegistry: InvoiceTemplateRegistry,
    private readonly payloadBuilder: InvoicePayloadBuilderService,
  ) {}

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC: createInvoice — called after a successful payment
  // ══════════════════════════════════════════════════════════════════
  async createInvoice(
    orderId: string,
    gstData: {
      totalCgst: number;
      totalSgst: number;
      totalIgst: number;
      totalTax: number;
      subTotal: number;
      grandTotal: number;
      vendorGstId?: string;
    } | null = null,
  ): Promise<void> {
    // ── Step 1: Fetch order + deep relations ──────────────────────────
    const orderData =
      await this.payloadBuilder.fetchOrderWithRelations(orderId);
    const companyId = orderData.company_id;

    // ── Step 2: Fetch company identity data in parallel ───────────────
    const context: CompanyContext =
      await this.payloadBuilder.fetchCompanyContext(companyId);

    // ── Step 3: Determine template ────────────────────────────────────
    const templateId =
      context.config?.default_invoice_template?.template_name ?? 'standard-gst';

    // ── Step 4: Group items by warehouse ──────────────────────────────
    const { assigned, unresolved } = this.payloadBuilder.groupItemsByWarehouse(
      orderData.items,
    );

    if (unresolved.length > 0) {
      this.logger.warn(
        `Order ${orderId}: ${unresolved.length} item(s) skipped — no warehouse assigned.`,
      );
    }
    if (assigned.size === 0) {
      throw new InternalServerErrorException(
        `No valid warehouses found for order ${orderId}.`,
      );
    }

    // ── Step 5: Build shared info maps ────────────────────────────────
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
      companyName: this.payloadBuilder.resolveVendorName(assigned),
      gstNumber:
        context.config?.default_invoice_template?.template_name ?? 'N/A',
      mobileNumber:
        orderData.items[0]?.variant?.product?.vendor?.user?.phone_number ??
        'N/A',
      email: orderData.customer.email,
    };

    // ── Step 6: Generate one invoice per warehouse group in parallel ───
    const prefix = context.config?.invoice_number_prefix ?? 'INV';

    const results = await Promise.allSettled(
      Array.from(assigned.values()).map((group) =>
        this.generateInvoiceForGroup(
          orderId,
          group,
          mappedOrderInfo,
          mappedVendorInfo,
          context,
          templateId,
          prefix,
          gstData,
        ),
      ),
    );

    // ── Step 7: Collect successes, log failures ───────────────────────
    const insertions: (typeof invoices.$inferInsert)[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        insertions.push(...result.value);
      } else {
        this.logger.error(
          `Warehouse invoice generation failed for order ${orderId}:`,
          result.reason,
        );
      }
    }

    if (insertions.length === 0) {
      throw new InternalServerErrorException(
        `All invoice generations failed for order ${orderId}.`,
      );
    }

    // ── Step 8: Bulk DB insert ────────────────────────────────────────
    await this.db
      .insert(invoices)
      .values(insertions)
      .catch((err) => {
        this.logger.error(
          `Failed to persist invoice records for order ${orderId}`,
          err,
        );
        throw new InternalServerErrorException(
          `Failed to save invoice records for order ${orderId}.`,
          { cause: err },
        );
      });

    this.logger.log(
      `Successfully generated ${insertions.length} invoice(s) for order ${orderId}.`,
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC: getBulkInvoiceUrls — admin/vendor bulk download
  // ══════════════════════════════════════════════════════════════════

  async getBulkInvoiceUrls(domain: string, orderIds: string[]) {
    const filteredDomain = domainExtractor(domain);
    const companyId = await this.companyService.find(filteredDomain);

    return this.db
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

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC: listTemplates — admin UI endpoint helper
  // ══════════════════════════════════════════════════════════════════

  listAvailableTemplates() {
    return this.templateRegistry.listTemplates();
  }

  // ══════════════════════════════════════════════════════════════════
  // PRIVATE: generate PDF + upload for one warehouse group
  // ══════════════════════════════════════════════════════════════════

  private async generateInvoiceForGroup(
    orderId: string,
    group: WarehouseGroup,
    orderInfo: MappedOrderInfo,
    vendorInfo: MappedVendorInfo,
    context: CompanyContext,
    templateId: string,
    prefix: string,
    gstData: {
      totalCgst: number;
      totalSgst: number;
      totalIgst: number;
      totalTax: number;
      subTotal: number;
      grandTotal: number;
      vendorGstId?: string;
    } | null,
  ): Promise<(typeof invoices.$inferInsert)[]> {
    // 1. Build invoice number
    const invoiceNumber = this.payloadBuilder.buildInvoiceNumber(
      group.warehouse.id,
      prefix,
    );

    // 2. Build the standardized payload (all DB calls done here)
    const payload = await this.payloadBuilder.buildPayload(
      orderId,
      group,
      orderInfo,
      vendorInfo,
      context,
      invoiceNumber,
      templateId,
      gstData,
    );

    // 3. Retrieve the correct template from the registry
    const template = this.templateRegistry.getTemplate(templateId);

    // 4. Render PDF — template handles ALL visual concerns
    const pdfBuffer = await template.render(payload);

    // 5. Upload to Cloudinary
    const invoiceUrl = await this.uploadService.uploadInvoice(
      pdfBuffer,
      `invoice_${orderId}_${group.warehouse.id}`,
    );

    // 6. Return DB insert shape
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
}
