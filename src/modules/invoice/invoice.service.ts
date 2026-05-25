// ../../modules/invoice/invoice.service.ts
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InvoicePayloadBuilderService } from './invoice-payload-builder.service';
import { InvoiceTemplateRegistry } from './template.registry';
import { UploadToCloudService } from '../../utils/upload-to-cloud/upload-to-cloud.service';
import { CompanyService } from '../company/company.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { Inject } from '@nestjs/common';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import { and, eq, inArray } from 'drizzle-orm';
import { invoices } from '../../drizzle/schema';

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly payloadBuilder: InvoicePayloadBuilderService,
    private readonly templateRegistry: InvoiceTemplateRegistry,
    private readonly uploadToCloudService: UploadToCloudService,
    private readonly companyService: CompanyService,
  ) {}

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC: entry point — called from OrdersService after payment
  // ══════════════════════════════════════════════════════════════════

  async createInvoice(orderId: string): Promise<void> {
    console.log(
      `[InvoiceService.createInvoice] Request received for orderId: ${orderId}`,
    );
    // ── 1. Fetch full order with all relations ────────────────────
    console.log('[InvoiceService.createInvoice] Fetching order with relations');
    const orderData =
      await this.payloadBuilder.fetchOrderWithRelations(orderId);
    const companyId = orderData.company_id;

    // ── 2. Fetch company context (branding / legal / config) ──────
    console.log('[InvoiceService.createInvoice] Fetching company context');
    const context = await this.payloadBuilder.fetchCompanyContext(companyId);

    // ── 3. Fetch GST data already stored in gst_invoices for this order ──
    console.log('[InvoiceService.createInvoice] Fetching GST data for order');
    const gstData = await this.payloadBuilder.fetchGstDataForOrder(
      orderId,
      companyId,
    );

    // ── 4. Fetch payment info for footer ──────────────────────────
    console.log('[InvoiceService.createInvoice] Fetching payment information');
    const paymentInfo = await this.payloadBuilder.fetchPaymentInfo(orderId);

    // ── 5. Group order items by warehouse → one invoice per warehouse ──
    console.log('[InvoiceService.createInvoice] Grouping items by warehouse');
    const { assigned, unresolved } = this.payloadBuilder.groupItemsByWarehouse(
      orderData.items,
    );

    if (unresolved.length > 0) {
      this.logger.warn(
        `[InvoiceService] ${unresolved.length} item(s) have no warehouse for order ${orderId}`,
      );
    }

    if (assigned.size === 0) {
      throw new InternalServerErrorException(
        `No valid warehouses found for order ${orderId}`,
      );
    }

    // ── 6. Map shared order-level info once ───────────────────────
    console.log('[InvoiceService.createInvoice] Mapping order and vendor payloads');
    const orderInfo = this.payloadBuilder.mapOrderInfo(orderData);
    const vendorInfo = this.payloadBuilder.mapVendorInfo(assigned, gstData);

    // ── 7. Resolve template ID ────────────────────────────────────
    const templateId =
      context.config?.default_invoice_template?.template_name ?? 'standard-gst';

    // ── 8. Generate one invoice per warehouse group, in parallel ──
    console.log(
      `[InvoiceService.createInvoice] Generating ${assigned.size} invoice payload(s)`,
    );
    const results = await Promise.allSettled(
      Array.from(assigned.entries()).map(([warehouseId, group]) =>
        this._generateOneInvoice(
          orderId,
          warehouseId,
          group,
          orderInfo,
          vendorInfo,
          context,
          templateId,
          gstData,
          paymentInfo,
        ),
      ),
    );

    // ── 9. Collect successful DB rows ─────────────────────────────
    const invoiceInsertions: (typeof invoices.$inferInsert)[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        invoiceInsertions.push(result.value);
      } else {
        this.logger.error(
          `[InvoiceService] Invoice generation failed for order ${orderId}`,
          result.reason,
        );
      }
    }

    if (invoiceInsertions.length === 0) {
      throw new InternalServerErrorException(
        `All invoice generations failed for order ${orderId}.`,
      );
    }

    // ── 10. Persist invoice records ───────────────────────────────
    console.log('[InvoiceService.createInvoice] Persisting invoice records');
    await this.db.insert(invoices).values(invoiceInsertions);
    this.logger.log(
      `[InvoiceService] ${invoiceInsertions.length} invoice(s) saved for order ${orderId}`,
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC: bulk fetch invoice URLs for admin / orders listing
  // ══════════════════════════════════════════════════════════════════

  async getBulkInvoiceUrls(domain: string, orderIds: string[]) {
    console.log(
      `[InvoiceService.getBulkInvoiceUrls] Request received for domain: ${domain} with ${orderIds.length} order id(s)`,
    );
    const filteredDomain = domainExtractor(domain);
    console.log(
      `[InvoiceService.getBulkInvoiceUrls] Extracted filtered domain: ${filteredDomain}`,
    );
    console.log('[InvoiceService.getBulkInvoiceUrls] Resolving company identifier');
    const companyId = await this.companyService.find(filteredDomain);
    console.log(
      `[InvoiceService.getBulkInvoiceUrls] Company resolved: ${companyId}`,
    );
    console.log('[InvoiceService.getBulkInvoiceUrls] Querying invoices');
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
  // PRIVATE: render + upload one invoice for one warehouse group
  // ══════════════════════════════════════════════════════════════════

  private async _generateOneInvoice(
    orderId: string,
    warehouseId: string,
    group: import('./interfaces/invoice.interface').WarehouseGroup,
    orderInfo: import('./interfaces/invoice.interface').MappedOrderInfo,
    vendorInfo: import('./interfaces/invoice.interface').MappedVendorInfo,
    context: import('./interfaces/invoice.interface').CompanyContext,
    templateId: string,
    gstData: Awaited<
      ReturnType<InvoicePayloadBuilderService['fetchGstDataForOrder']>
    >,
    paymentInfo: Awaited<
      ReturnType<InvoicePayloadBuilderService['fetchPaymentInfo']>
    >,
  ): Promise<typeof invoices.$inferInsert> {
    console.log(
      `[InvoiceService._generateOneInvoice] Building invoice for orderId: ${orderId}, warehouseId: ${warehouseId}`,
    );
    const invoiceNumber = this.payloadBuilder.buildInvoiceNumber(
      warehouseId,
      context.config?.invoice_number_prefix ?? 'INV',
    );

    // Build the fully-typed, DB-free payload
    console.log('[InvoiceService._generateOneInvoice] Building invoice payload');
    const payload = await this.payloadBuilder.buildPayload(
      orderId,
      group,
      orderInfo,
      vendorInfo,
      context,
      invoiceNumber,
      templateId,
      gstData,
      paymentInfo,
    );

    // Render to PDF buffer via the registered template
    console.log('[InvoiceService._generateOneInvoice] Rendering invoice template');
    const template = this.templateRegistry.getTemplate(templateId);
    const pdfBuffer = await template.render(payload);

    // Upload to cloud storage
    console.log('[InvoiceService._generateOneInvoice] Uploading invoice document');
    const invoiceUrl = await this.uploadToCloudService.uploadInvoice(
      pdfBuffer,
      `invoice_${orderId}_${warehouseId}`,
    );

    console.log(
      `[InvoiceService._generateOneInvoice] Invoice built successfully: ${invoiceNumber}`,
    );
    return {
      invoice_number: invoiceNumber,
      invoice_url: invoiceUrl,
      order_id: orderId,
      order_item_id: group.items[0].id,
      company_id: group.items[0].company_id,
    };
  }
}
