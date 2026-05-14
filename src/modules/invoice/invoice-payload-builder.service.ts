import {
  Injectable,
  Inject,
  InternalServerErrorException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import {
  gst_registrations,
  company_branding,
  company_document_config,
  company_legal_profile,
  company_compliance,
  orders,
  product_images,
} from '../../drizzle/schema';
import {
  CompanyContext,
  GroupingResult,
  InvoiceBranding,
  InvoiceCustomer,
  InvoiceFooter,
  InvoiceLegal,
  InvoiceLineItem,
  InvoiceMeta,
  InvoiceTotals,
  MappedOrderInfo,
  MappedVendorInfo,
  OrderItem,
  OrderWithRelations,
  StandardizedInvoicePayload,
  WarehouseGroup,
} from './interfaces/invoice.interface';
import { randomUUID } from 'crypto';
import { fetchImageAsBuffer } from 'src/utils/image-fetcher.util';

// ─── tiny helper ────────────────────────────────────────────────
function numberToWords(num: number): string {
  const ones = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const tens = [
    '',
    '',
    'Twenty',
    'Thirty',
    'Forty',
    'Fifty',
    'Sixty',
    'Seventy',
    'Eighty',
    'Ninety',
  ];
  if (num === 0) return 'Zero';
  const convert = (n: number): string => {
    if (n < 20) return ones[n];
    if (n < 100)
      return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    if (n < 1000)
      return (
        ones[Math.floor(n / 100)] +
        ' Hundred' +
        (n % 100 ? ' ' + convert(n % 100) : '')
      );
    if (n < 100_000)
      return (
        convert(Math.floor(n / 1000)) +
        ' Thousand' +
        (n % 1000 ? ' ' + convert(n % 1000) : '')
      );
    if (n < 10_000_000)
      return (
        convert(Math.floor(n / 100_000)) +
        ' Lakh' +
        (n % 100_000 ? ' ' + convert(n % 100_000) : '')
      );
    return (
      convert(Math.floor(n / 10_000_000)) +
      ' Crore' +
      (n % 10_000_000 ? ' ' + convert(n % 10_000_000) : '')
    );
  };
  const [intPart, decPart] = num.toFixed(2).split('.');
  const words = convert(parseInt(intPart));
  const paise = parseInt(decPart);
  return `${words}${paise ? ' And ' + convert(paise) + ' Paise' : ''} Only`;
}

/**
 * InvoicePayloadBuilderService
 *
 * Single responsibility: query the DB for everything an invoice needs
 * and produce a clean, typed StandardizedInvoicePayload.
 *
 * InvoiceService calls this once, then passes the result to the chosen template.
 * Templates NEVER touch the database.
 */
@Injectable()
export class InvoicePayloadBuilderService {
  private readonly logger = new Logger(InvoicePayloadBuilderService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleService) {}

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC: build the full payload for one order + one warehouse group
  // ══════════════════════════════════════════════════════════════════

  async buildPayload(
    orderId: string,
    group: WarehouseGroup,
    orderInfo: MappedOrderInfo,
    vendorInfo: MappedVendorInfo,
    context: CompanyContext,
    invoiceNumber: string,
    templateId: string,
    gstData: {
      totalCgst: number;
      totalSgst: number;
      totalIgst: number;
      totalTax: number;
      subTotal: number;
      grandTotal: number;
      vendorGstId?: string;
    } | null,
  ): Promise<StandardizedInvoicePayload> {
    const { config, branding, legal } = context;

    // ── 1. Compliance fields (GSTIN, PAN, CIN …) ──────────────────
    const complianceRows = await this.db
      .select()
      .from(company_compliance)
      .where(eq(company_compliance.company_id, group.items[0].company_id))
      .catch(() => []);

    const taxIds = complianceRows.length
      ? complianceRows.map((r) => ({
          key: r.field_key.toUpperCase(),
          value: r.field_value,
        }))
      : vendorInfo.gstNumber !== 'N/A'
        ? [{ key: 'GSTIN', value: vendorInfo.gstNumber }]
        : [];

    // ── 2. Line items ──────────────────────────────────────────────
    let subTotal = 0;
    const items: InvoiceLineItem[] = group.items.map((item) => {
      const unitPrice = Number(item.price);
      const lineTotal = unitPrice * item.quantity;
      subTotal += lineTotal;
      return {
        name: item.variant?.product?.name ?? 'Unknown Product',
        quantity: item.quantity,
        unitPrice,
        taxAmount: 0, // individual line tax; overridden by gstData totals below
        taxRate: 0,
        totalAmount: lineTotal,
      };
    });

    // ── 3. Totals ──────────────────────────────────────────────────
    const currency = config?.default_currency ?? 'INR';
    const resolvedSubTotal = gstData?.subTotal ?? subTotal;
    const grandTotal = gstData?.grandTotal ?? subTotal;
    const totalTax = gstData?.totalTax ?? 0;

    const totals: InvoiceTotals = {
      subTotal: resolvedSubTotal,
      totalCgst: gstData?.totalCgst ?? 0,
      totalSgst: gstData?.totalSgst ?? 0,
      totalIgst: gstData?.totalIgst ?? 0,
      totalTax,
      grandTotal,
      currency,
      grandTotalInWords: numberToWords(grandTotal),
    };

    // ── 4. Branding ────────────────────────────────────────────────
    const brandingPayload: InvoiceBranding = {
      logoUrl: branding?.logo_url,
      logoBuffer: branding?.logo_url
        ? ((await fetchImageAsBuffer(branding?.logo_url)) ?? undefined)
        : undefined,
      primaryColor: branding?.primary_color ?? '#232F3E', // Amazon dark blue fallback
      secondaryColor: branding?.secondary_color ?? undefined,
      accentColor: branding?.accent_color ?? undefined,
      watermarkUrl: branding?.watermark_url,
    };

    // ── 5. Legal ───────────────────────────────────────────────────
    const legalPayload: InvoiceLegal = {
      legalName: legal?.legal_name ?? vendorInfo.companyName,
      tradeName: legal?.trade_name ?? vendorInfo.companyName,
      supportEmail: legal?.support_email ?? vendorInfo.email,
      supportPhone: legal?.support_phone ?? vendorInfo.mobileNumber,
      websiteUrl: legal?.website_url ?? undefined,
      taxIds,
    };

    // ── 6. Customer ────────────────────────────────────────────────
    const { shippingAddress } = orderInfo;
    const formattedAddress =
      `${shippingAddress.addressLine1}, ${shippingAddress.city}, ` +
      `${shippingAddress.state} - ${shippingAddress.pincode}`;

    const customerPayload: InvoiceCustomer = {
      name: orderInfo.customerName,
      phone:
        orderInfo.customerPhone !== 'N/A' ? orderInfo.customerPhone : undefined,
      shippingAddress: formattedAddress,
      billingAddress: formattedAddress,
      placeOfSupply: shippingAddress.state
        ? `${shippingAddress.state}`
        : undefined,
    };

    // ── 7. Footer ──────────────────────────────────────────────────
    const footerPayload: InvoiceFooter = {
      termsAndConditions:
        config?.invoice_terms_and_conditions ??
        [
          'Goods once sold cannot be taken back or exchanged.',
          'We are not the manufacturers; the company will stand for warranty as per their terms.',
          'Interest @24% p.a. will be charged for uncleared bills beyond 15 days.',
          'Subject to local jurisdiction.',
        ].join('\n'),
      notes: config?.invoice_footer_text ?? 'Thank you for the Business',
      signatoryName: config?.signatory_name ?? 'Authorized Signatory',
      signatoryDesignation: config?.signatory_designation ?? undefined,
      // signatoryUrl: config?.signatory_signature_url,
    };

    // ── 8. Meta ────────────────────────────────────────────────────
    const meta: InvoiceMeta = {
      invoiceNumber,
      invoiceDate: new Date(),
      templateId,
    };

    return {
      meta,
      branding: brandingPayload,
      legal: legalPayload,
      customer: customerPayload,
      items,
      totals,
      footer: footerPayload,
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC: fetch full order with all relations needed for invoice
  // ══════════════════════════════════════════════════════════════════

  async fetchOrderWithRelations(orderId: string): Promise<OrderWithRelations> {
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
                      vendor: { with: { user: true } },
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
        this.logger.error(`Failed to fetch order ${orderId}`, err);
        throw new InternalServerErrorException(
          `Failed to fetch order ${orderId}.`,
          { cause: err },
        );
      })) as OrderWithRelations | undefined;

    if (!orderData) throw new NotFoundException(`Order ${orderId} not found`);
    if (!orderData.items.length)
      throw new NotFoundException(`Order ${orderId} has no items`);
    return orderData;
  }

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC: fetch company identity data in one parallel call
  // ══════════════════════════════════════════════════════════════════

  async fetchCompanyContext(companyId: string): Promise<CompanyContext> {
    const [config, branding, legal] = await Promise.all([
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
    return {
      config: config ?? null,
      branding: branding ?? null,
      legal: legal ?? null,
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC: group order items by warehouse (unchanged from your code)
  // ══════════════════════════════════════════════════════════════════

  groupItemsByWarehouse(items: OrderItem[]): GroupingResult {
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

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC: deterministic invoice number builder
  // ══════════════════════════════════════════════════════════════════

  buildInvoiceNumber(warehouseId: string, prefix = 'INV'): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const unique = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
    const wh = warehouseId.replace(/-/g, '').slice(0, 4).toUpperCase();
    return `${prefix}-${date}-${unique}-${wh}`;
  }

  resolveVendorName(assigned: Map<string, WarehouseGroup>): string {
    for (const group of assigned.values())
      for (const item of group.items)
        if (item.variant?.product?.vendor?.store_name)
          return item.variant.product.vendor.store_name;
    return 'Vendor Store';
  }
}
