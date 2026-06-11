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
import { InvoiceErrorKeyEnum } from './constants/invoice.enums';

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
  // async createInvoice(orderId: string): Promise<void> {
  //     //   // ── 1. Fetch full order with all relations ────────────────────
  //   const orderData =
  //     await this.payloadBuilder.fetchOrderWithRelations(orderId);
  //   const companyId = orderData.company_id;
  //   // ── 2. Fetch company context (branding / legal / config) ──────
  //   const context = await this.payloadBuilder.fetchCompanyContext(companyId);
  //   // ── 3. Fetch GST data already stored in gst_invoices for this order ──
  //   const gstData = await this.payloadBuilder.fetchGstDataForOrder(
  //     orderId,
  //     companyId,
  //   );
  //   // ── 4. Fetch payment info for footer ──────────────────────────
  //   const paymentInfo = await this.payloadBuilder.fetchPaymentInfo(orderId);
  //   // ── 5. Group order items by warehouse → one invoice per warehouse ──
  //   const { assigned, unresolved } = this.payloadBuilder.groupItemsByWarehouse(
  //     orderData.items,
  //   );
  //   if (unresolved.length > 0) {
  //     this.logger.warn(
  //       `[InvoiceService] ${unresolved.length} item(s) have no warehouse for order ${orderId}`,
  //     );
  //   }
  //   if (assigned.size === 0) {
  //     throw new InternalServerErrorException(
  //       `No valid warehouses found for order ${orderId}`,
  //     );
  //   }
  //   // ── 6. Map shared order-level info once ───────────────────────
  //     //   const orderInfo = this.payloadBuilder.mapOrderInfo(orderData);
  //     //     //   const vendorInfo = this.payloadBuilder.mapVendorInfo(assigned, gstData);
  //   // ── 7. Resolve template ID ────────────────────────────────────
  //   const templateId =
  //     context.config?.default_invoice_template?.template_name ?? 'standard-gst';
  //   // ── 8. Generate one invoice per warehouse group, in parallel ──
  //     //   // const results = await Promise.allSettled(
  //   //   Array.from(assigned.entries()).map(([warehouseId, group]) =>
  //   //     this._generateOneInvoice(
  //   //       orderId,
  //   //       warehouseId,
  //   //       group,
  //   //       orderInfo,
  //   //       vendorInfo,
  //   //       context,
  //   //       templateId,
  //   //       gstData,
  //   //       paymentInfo,
  //   //     ),
  //   //   ),
  //   // );
  //   // ── 9. Collect successful DB rows ─────────────────────────────
  //   // const invoiceInsertions: (typeof invoices.$inferInsert)[] = [];
  //   // for (const result of results) {
  //   //   if (result.status === 'fulfilled') {
  //   //     invoiceInsertions.push(result.value);
  //   //   } else {
  //   //     this.logger.error(
  //   //       `[InvoiceService] Invoice generation failed for order ${orderId}`,
  //   //       result.reason,
  //   //     );
  //   //   }
  //   // }
  //   // if (invoiceInsertions.length === 0) {
  //   //   throw new InternalServerErrorException(
  //   //     `All invoice generations failed for order ${orderId}.`,
  //   //   );
  //   // }
  //   // // ── 10. Persist invoice records ───────────────────────────────
  //   //   //   // await this.db.insert(invoices).values(invoiceInsertions);
  //   // this.logger.log(
  //   //   `[InvoiceService] ${invoiceInsertions.length} invoice(s) saved for order ${orderId}`,
  //   // );
  // }
  // ══════════════════════════════════════════════════════════════════
  // PUBLIC: bulk fetch invoice URLs for admin / orders listing
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
  async getInvoicePayload(orderId: string, domain: string) {
    const orderData =
      await this.payloadBuilder.fetchOrderWithRelations(orderId);
    const companyId = orderData.company_id;
    const [context, gstData, paymentInfo] = await Promise.all([
      this.payloadBuilder.fetchCompanyContext(companyId),
      this.payloadBuilder.fetchGstDataForOrder(orderId, companyId),
      this.payloadBuilder.fetchPaymentInfo(orderId),
    ]);
    const { assigned, unresolved } = this.payloadBuilder.groupItemsByWarehouse(
      orderData.items,
    );
    if (assigned.size === 0)
      throw new InternalServerErrorException(InvoiceErrorKeyEnum.NO_WAREHOUSES_FOUND);
    const orderInfo = this.payloadBuilder.mapOrderInfo(orderData);
    const vendorInfo = this.payloadBuilder.mapVendorInfo(assigned, gstData);
    const templateId =
      context.config?.default_invoice_template?.template_name ?? 'standard-gst';
    // Build payload for the first warehouse group (adjust if you need multi-warehouse)
    const [warehouseId, group] = Array.from(assigned.entries())[0];
    const invoiceNumber = this.payloadBuilder.buildInvoiceNumber(
      warehouseId,
      context.config?.invoice_number_prefix ?? 'INV',
    );
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
    // Strip the logoBuffer (it's a Buffer, not JSON-serializable)
    const { logoBuffer, ...brandingWithoutBuffer } = payload.branding;
    return {
      ...payload,
      branding: brandingWithoutBuffer,
      templateId,
    };
  }
  // ══════════════════════════════════════════════════════════════════
  // PRIVATE: render + upload one invoice for one warehouse group
  // ══════════════════════════════════════════════════════════════════
  // private async _generateOneInvoice(
  //   orderId: string,
  //   warehouseId: string,
  //   group: import('./interfaces/invoice.interface').WarehouseGroup,
  //   orderInfo: import('./interfaces/invoice.interface').MappedOrderInfo,
  //   vendorInfo: import('./interfaces/invoice.interface').MappedVendorInfo,
  //   context: import('./interfaces/invoice.interface').CompanyContext,
  //   templateId: string,
  //   gstData: Awaited<
  //     ReturnType<InvoicePayloadBuilderService['fetchGstDataForOrder']>
  //   >,
  //   paymentInfo: Awaited<
  //     ReturnType<InvoicePayloadBuilderService['fetchPaymentInfo']>
  //   >,
  // ): Promise<typeof invoices.$inferInsert> {
  //     //   const invoiceNumber = this.payloadBuilder.buildInvoiceNumber(
  //     warehouseId,
  //     context.config?.invoice_number_prefix ?? 'INV',
  //   );
  //   // Build the fully-typed, DB-free payload
  //     //   const payload = await this.payloadBuilder.buildPayload(
  //     orderId,
  //     group,
  //     orderInfo,
  //     vendorInfo,
  //     context,
  //     invoiceNumber,
  //     templateId,
  //     gstData,
  //     paymentInfo,
  //   );
  //   // Render to PDF buffer via the registered template
  //     //   const template = this.templateRegistry.getTemplate(templateId);
  //   const pdfBuffer = await template.render(payload);
  //   // Upload to cloud storage
  //     //   const invoiceUrl = await this.uploadToCloudService.uploadInvoice(
  //     pdfBuffer,
  //     `invoice_${orderId}_${warehouseId}`,
  //   );
  //     //   return {
  //     invoice_number: invoiceNumber,
  //     invoice_url: invoiceUrl,
  //     order_id: orderId,
  //     order_item_id: group.items[0].id,
  //     company_id: group.items[0].company_id,
  //   };
  // }
}
