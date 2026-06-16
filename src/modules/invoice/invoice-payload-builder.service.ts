// ../../modules/invoice/invoice-payload-builder.service.ts
import {
  Injectable,
  Inject,
  InternalServerErrorException,
  NotFoundException,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import {
  company_branding,
  company_compliance,
  company_document_config,
  company_legal_profile,
  gst_invoices,
  orders,
  payments,
} from '../../drizzle/schema';
import {
  CompanyContext,
  DbAddress,
  GroupingResult,
  InvoiceAddress,
  InvoiceBranding,
  InvoiceCustomer,
  InvoiceFooter,
  InvoiceLegal,
  InvoiceLineItem,
  InvoiceMeta,
  InvoicePaymentInfo,
  InvoiceSeller,
  InvoiceTotals,
  MappedOrderInfo,
  MappedVendorInfo,
  OrderItem,
  OrderWithRelations,
  StandardizedInvoicePayload,
  WarehouseGroup,
} from './interfaces/invoice.interface';
import { randomUUID } from 'crypto';
import { fetchImageAsBuffer } from '../../utils/image-fetcher.util';
import { COUNTRIES_COMPLIANCE, getStateByCode } from '../../common/constants';
import { InvoiceErrorKeyEnum } from './constants/invoice.enums';

// ─── helpers ────────────────────────────────────────────────────

/** Indian state code map — first two chars of GSTIN = state code */
const STATE_CODE_MAP: Record<string, string> = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli and Daman & Diu',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh (New)',
};

function getStateCodeFromGstin(gstin: string): string | undefined {
  return gstin?.length >= 2 ? gstin.slice(0, 2) : undefined;
}

function numberToWords(num: number): string {
  if (num === 0) return 'Zero only';
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
  const convert = (n: number): string => {
    if (n < 20) return ones[n];
    if (n < 100)
      return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    if (n < 1_000)
      return (
        ones[Math.floor(n / 100)] +
        ' Hundred' +
        (n % 100 ? ' ' + convert(n % 100) : '')
      );
    if (n < 1_00_000)
      return (
        convert(Math.floor(n / 1_000)) +
        ' Thousand' +
        (n % 1_000 ? ' ' + convert(n % 1_000) : '')
      );
    if (n < 1_00_00_000)
      return (
        convert(Math.floor(n / 1_00_000)) +
        ' Lakh' +
        (n % 1_00_000 ? ' ' + convert(n % 1_00_000) : '')
      );
    return (
      convert(Math.floor(n / 1_00_00_000)) +
      ' Crore' +
      (n % 1_00_00_000 ? ' ' + convert(n % 1_00_00_000) : '')
    );
  };
  const [intStr, decStr] = num.toFixed(2).split('.');
  const words = convert(parseInt(intStr, 10));
  const paise = parseInt(decStr, 10);
  return `${words}${paise ? ' and ' + convert(paise) + ' Paise' : ''} only`;
}

function formatDbAddress(
  addr: DbAddress,
  recipientName?: string,
): InvoiceAddress {
  return {
    recipientName: recipientName ?? addr.name ?? '',
    addressLine1: addr.address_line_1,

    street: addr.street || undefined,
    city: addr.city,
    state: addr.state,
    postalCode: addr.postal_code,
    country: addr.country,
  };
}

function isInterState(sellerGstin: string, buyerState: string): boolean {
  const sellerStateCode = getStateCodeFromGstin(sellerGstin);
  if (!sellerStateCode) return false;
  const sellerState = STATE_CODE_MAP[sellerStateCode]?.toUpperCase();
  return sellerState !== buyerState.toUpperCase();
}

// ──────────────────────────────────────────────────────────────────

@Injectable()
export class InvoicePayloadBuilderService {
  private readonly logger = new Logger(InvoicePayloadBuilderService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleService) {}

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC: fetch order + all needed relations
  // ══════════════════════════════════════════════════════════════════

  async fetchOrderWithRelations(orderId: string): Promise<OrderWithRelations> {
    const orderData = (await this.db.query.orders
      .findFirst({
        where: eq(orders.id, orderId),
        with: {
          customer: true,
          address: true,
          promotionUsage: true,
          promotionAnalyticsEvents: {
            columns: {
              promotion_id: true,
              event_type: true,
              discount_amount: true,
            },
          },
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
    if (!orderData.items?.length)
      throw new NotFoundException(`Order ${orderId} has no items`);
    return orderData;
  }

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC: fetch company branding / legal / config in one shot
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
  // PUBLIC: fetch GST amounts already computed + saved at order creation
  // ══════════════════════════════════════════════════════════════════

  async fetchGstDataForOrder(
    orderId: string,
    companyId: string,
  ): Promise<{
    totalCgst: number;
    totalSgst: number;
    totalIgst: number;
    totalTax: number;
    vendorGstin: string | null;
  } | null> {
    // 1. Fetch the pre-computed GST amounts from gst_invoices
    const row = await this.db.query.gst_invoices
      .findFirst({ where: eq(gst_invoices.order_id, orderId) })
      .catch(() => null);

    if (!row) return null;

    // Fetch the state_code row that shares the same valid_until

    // Also fetch the gst_number for returning vendorGstId
    const [countryCompliance] = await this.db
      .select()
      .from(company_compliance)
      .where(eq(company_compliance.company_id, companyId))
      .catch((error) => {
        throw new HttpException(
          InvoiceErrorKeyEnum.ERROR_FETCHING_COMPANY_COMPLIANCE + error,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      });

    const fields = COUNTRIES_COMPLIANCE.find(
      (c) => c.country_code === countryCompliance.country_code,
    )?.fields;
    if (!fields) {
      throw new HttpException(
        InvoiceErrorKeyEnum.COUNTRY_COMPLIANCE_CONFIG_NOT_FOUND,
        HttpStatus.BAD_REQUEST,
      );
    }
    /**
     * Find tax field (GSTIN for India)
     */
    const gstField = fields.find(
      (f) => f.is_primary_tax_id || f.value === 'gstin',
    );

    if (!gstField?.value) {
      throw new HttpException(
        InvoiceErrorKeyEnum.GST_FIELD_CONFIG_MISSING,
        HttpStatus.BAD_REQUEST,
      );
    }
    const [gstNumberRow] = await this.db
      .select()
      .from(company_compliance)
      .where(
        and(
          eq(company_compliance.company_id, companyId),
          eq(company_compliance.field_key, gstField.value),
          eq(company_compliance.is_active, true),
        ),
      )
      .catch((error) => {
        throw new HttpException(
          InvoiceErrorKeyEnum.ERROR_FETCHING_VENDOR_GST_NUMBER + error,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      });

    if (!gstNumberRow?.field_value) {
      throw new HttpException(
        InvoiceErrorKeyEnum.VENDOR_GST_NUMBER_IS_MISSING,
        HttpStatus.BAD_REQUEST,
      );
    }

    return {
      totalCgst: Number(row.cgst_amount),
      totalSgst: Number(row.sgst_amount),
      totalIgst: Number(row.igst_amount),
      totalTax: Number(row.total_tax),
      vendorGstin: gstNumberRow.field_value,
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC: fetch payment record for the order (optional footer info)
  // ══════════════════════════════════════════════════════════════════

  async fetchPaymentInfo(
    orderId: string,
  ): Promise<InvoicePaymentInfo | undefined> {
    const row = await this.db.query.payments
      .findFirst({ where: eq(payments.order_id, orderId) })
      .catch(() => null);

    if (!row) return undefined;
    return {
      transactionId: row.transaction_ref ?? undefined,
      paymentMethod: row.payment_method ?? undefined,
      invoiceValue: Number(row.amount),
      paidAt: row.updated_at ? new Date(row.updated_at) : undefined,
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC: map raw DB order → clean MappedOrderInfo
  // ══════════════════════════════════════════════════════════════════

  mapOrderInfo(order: OrderWithRelations): MappedOrderInfo {
    const customerName =
      [order.customer.first_name, order.customer.last_name]
        .filter(Boolean)
        .join(' ') || 'Customer';
    const discountAmount = Array.isArray(order.promotionUsage)
      ? order.promotionUsage.reduce(
          (sum, usage) => sum + Number(usage.discount_amount ?? 0),
          0,
        )
      : 0;

    const addr = order.address;
    return {
      id: order.id,
      orderDate: order.created_at,
      customerName,
      customerPhone: order.customer.phone_number ?? undefined,
      customerEmail: order.customer.email,
      discountAmount,
      shippingAddress: {
        recipientName: customerName,
        addressLine1: addr.address_line_1,

        street: addr.street || undefined,
        city: addr.city,
        state: addr.state.toUpperCase(),
        pincode: addr.postal_code,
        country: addr.country || 'IN',
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC: map warehouse groups → vendor info (with GST from gst_invoices)
  // ══════════════════════════════════════════════════════════════════

  mapVendorInfo(
    assigned: Map<string, WarehouseGroup>,
    gstData: { vendorGstin: string | null } | null,
  ): MappedVendorInfo {
    for (const group of assigned.values()) {
      for (const item of group.items) {
        const vendor = item.variant?.product?.vendor;
        if (vendor) {
          return {
            companyName: vendor.store_name,
            gstNumber: gstData?.vendorGstin ?? 'N/A',
            panNumber: 'N/A', // pulled from compliance table in buildPayload
            mobileNumber: vendor.user?.phone_number ?? undefined,
            email: vendor.user?.email ?? '',
          };
        }
      }
    }
    return {
      companyName: 'Vendor Store',
      gstNumber: gstData?.vendorGstin ?? 'N/A',
      panNumber: 'N/A',
      mobileNumber: undefined,
      email: '',
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC: group order items by warehouse
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
  // PUBLIC: build invoice number from config prefix + date + random
  // ══════════════════════════════════════════════════════════════════

  buildInvoiceNumber(warehouseId: string, prefix = 'INV'): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const unique = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
    const wh = warehouseId.replace(/-/g, '').slice(0, 4).toUpperCase();
    return `${prefix}-${date}-${unique}-${wh}`;
  }

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC: build the full StandardizedInvoicePayload
  // This is the main method — all data assembly lives here.
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
      vendorGstin: string | null;
    } | null,
    paymentInfo: InvoicePaymentInfo | undefined,
  ): Promise<StandardizedInvoicePayload> {
    const { config, branding, legal } = context;

    let complianceRows: (typeof company_compliance.$inferSelect)[] = [];
    try {
      complianceRows = await this.db
        .select()
        .from(company_compliance)
        .where(
          and(
            eq(company_compliance.company_id, group.items[0].company_id),
            eq(company_compliance.is_active, true),
          ),
        );
    } catch {
      complianceRows = [];
    }

    // Build taxIds — filter to GST-related keys for the invoice header
    const taxIds: Array<{ key: string; value: string }> = complianceRows
      .filter((r) => r.is_active && r.field_key === 'gstin')
      .map((r) => ({ key: 'GST Registration No', value: r.field_value }));

    // Add PAN if present
    const panRow = complianceRows.find((r) => r.field_key === 'pan');
    if (panRow) taxIds.push({ key: 'PAN', value: panRow.field_value });

    // Add CIN if present
    const cinRow = complianceRows.find((r) => r.field_key === 'cin');
    if (cinRow) taxIds.push({ key: 'CIN', value: cinRow.field_value });

    // If gstData has a vendorGstin not already in taxIds, prepend it
    if (gstData?.vendorGstin && gstData.vendorGstin !== 'N/A') {
      const alreadyHasGst = taxIds.some((t) => t.value === gstData.vendorGstin);
      if (!alreadyHasGst) {
        taxIds.unshift({
          key: 'GST Registration No',
          value: gstData.vendorGstin,
        });
      }
    }

    // Determine intra/inter state from seller GSTIN vs buyer state
    const sellerGstin =
      gstData?.vendorGstin ??
      taxIds.find((t) => t.key.includes('GST'))?.value ??
      '';
    const buyerState = orderInfo.shippingAddress.state;
    const isInterStateSupply = isInterState(sellerGstin, buyerState);
    // ── 2. Line items with per-line tax breakdown ─────────────────
    let runningSubTotal = 0;
    const totalNetAmount = group.items.reduce(
      (sum, item) => sum + Number(item.price) * item.quantity,
      0,
    );

    const items: InvoiceLineItem[] = group.items.map((item) => {
      const unitPriceInclusive = Number(item.price); // GST-INCLUSIVE price per unit
      const qty = item.quantity;
      const lineTotal = unitPriceInclusive * qty; // GST-inclusive line total

      const lineDiscountShare =
        totalNetAmount > 0
          ? (lineTotal / totalNetAmount) * orderInfo.discountAmount
          : 0;
      const lineDiscount = Math.round(lineDiscountShare);

      // ── Tax rate: must use the GST-EXCLUSIVE base as denominator ──
      // If inclusive total = T and tax = X, then exclusive base = T - X
      // taxRate = X / (T - X) * 100  ← correct
      // NOT:      X / T * 100         ← gives compressed (wrong) rate
      const totalExclusiveBase = totalNetAmount - (gstData?.totalTax ?? 0);
      const taxRate =
        gstData && totalExclusiveBase > 0
          ? (gstData.totalTax / totalExclusiveBase) * 100
          : 0;

      // Back-calculate GST-exclusive taxable amount from the inclusive line total
      const lineTaxableAmount =
        taxRate > 0
          ? Math.round((lineTotal / (1 + taxRate / 100)) * 100) / 100
          : lineTotal;

      const lineTaxAmount =
        Math.round((lineTotal - lineTaxableAmount) * 100) / 100;

      // Keep 2 decimal places so the taxable base doesn't lose fractional paise.
      // Rounding to an integer here was the primary cause of grand-total drift.
      const netAmount =
        Math.round((lineTaxableAmount - lineDiscount) * 100) / 100;

      runningSubTotal += netAmount;

      return {
        name: item.variant?.product?.name ?? 'Unknown Product',
        sku: item.variant?.sku ?? undefined,
        quantity: qty,
        // GST-exclusive unit price = inclusive price / (1 + rate/100)
        unitPrice:
          Math.round((unitPriceInclusive / (1 + taxRate / 100)) * 100) / 100,
        discount: lineDiscount,
        netAmount,
        taxRate,
        taxType: isInterStateSupply ? 'IGST' : 'CGST+SGST',
        taxAmount: lineTaxAmount,
        totalAmount: lineTotal - lineDiscount, // inclusive price minus discount
      };
    });

    // Recompute per-line tax amounts proportionally and lock taxRate to the
    // correct slab rate (derived from the GST-exclusive base).
    if (gstData && runningSubTotal > 0) {
      let taxAssigned = 0;
      for (let i = 0; i < items.length; i++) {
        if (i === items.length - 1) {
          items[i].taxAmount =
            Math.round((gstData.totalTax - taxAssigned) * 100) / 100;
        } else {
          const share =
            Math.round(
              (items[i].netAmount / runningSubTotal) * gstData.totalTax * 100,
            ) / 100;
          items[i].taxAmount = share;
          taxAssigned += share;
        }

        // ── Lock taxRate to actual slab rate using GST-exclusive base ──
        if (!isInterStateSupply && gstData.totalCgst > 0) {
          // CGST+SGST: combined rate = CGST% + SGST% = 2 × (totalCgst / exclusiveBase)
          items[i].taxRate =
            Math.round((gstData.totalCgst / runningSubTotal) * 2 * 100 * 100) /
            100;
        } else if (isInterStateSupply && gstData.totalIgst > 0) {
          // IGST: rate = totalIgst / exclusiveBase
          items[i].taxRate =
            Math.round((gstData.totalIgst / runningSubTotal) * 100 * 100) / 100;
        }

        // totalAmount = taxable net + extracted tax
        items[i].totalAmount = items[i].netAmount + items[i].taxAmount;
      }
    }

    // ── 3. Totals ─────────────────────────────────────────────────
    const currency = config?.default_currency ?? 'INR';
    const totalTax = gstData?.totalTax ?? 0;

    // ✅ grandTotal = taxable subtotal + extracted tax
    //    This must equal the original inclusive price sum — use Math.round, NOT
    //    Math.floor, so fractional paise are rounded correctly instead of truncated.
    const grandTotal = Math.round((runningSubTotal + totalTax) * 100) / 100;

    const totals: InvoiceTotals = {
      subTotal:
        Math.round((runningSubTotal + orderInfo.discountAmount) * 100) / 100,
      totalDiscount: orderInfo.discountAmount,
      netAmount: Math.round(runningSubTotal * 100) / 100,
      totalCgst: gstData?.totalCgst ?? 0,
      totalSgst: gstData?.totalSgst ?? 0,
      totalIgst: gstData?.totalIgst ?? 0,
      totalTax,
      grandTotal,
      currency,
      grandTotalInWords: numberToWords(grandTotal),
      reverseCharge: false,
    };
    // ── 4. Branding ───────────────────────────────────────────────
    const brandingPayload: InvoiceBranding = {
      logoUrl: branding?.logo_url ?? undefined,
      logoBuffer: branding?.logo_url
        ? ((await fetchImageAsBuffer(branding.logo_url)) ?? undefined)
        : undefined,
      primaryColor: branding?.primary_color ?? '#131921', // Amazon dark
      secondaryColor: branding?.secondary_color ?? undefined,
      accentColor: branding?.accent_color ?? undefined,
      watermarkUrl: branding?.watermark_url ?? null,
      fontFamily: branding?.font_family ?? undefined,
    };

    // ── 5. Seller block ───────────────────────────────────────────
    // Use warehouse address as dispatch address (Amazon "Sold By" address)
    const warehouseAddr = group.warehouse.address;
    const sellerAddress: InvoiceAddress = warehouseAddr
      ? {
          recipientName: legal?.legal_name ?? vendorInfo.companyName,
          addressLine1: warehouseAddr.address_line_1,

          street: warehouseAddr.street || undefined,
          city: warehouseAddr.city,
          state: warehouseAddr.state,
          postalCode: warehouseAddr.postal_code,
          country: warehouseAddr.country || 'IN',
          stateCode: getStateCodeFromGstin(sellerGstin),
        }
      : {
          recipientName: legal?.legal_name ?? vendorInfo.companyName,
          addressLine1: group.warehouse.warehouse_name,
          city: '',
          state: '',
          postalCode: '',
          country: 'IN',
        };

    const seller: InvoiceSeller = {
      legalName: legal?.legal_name ?? vendorInfo.companyName,
      address: sellerAddress,
      taxIds,
      supportEmail: legal?.support_email ?? vendorInfo.email ?? undefined,
      supportPhone:
        legal?.support_phone ?? vendorInfo.mobileNumber ?? undefined,
      websiteUrl: legal?.website_url ?? undefined,
    };

    // ── 6. Customer block ─────────────────────────────────────────
    const sa = orderInfo.shippingAddress;
    const shippingAddress: InvoiceAddress = {
      recipientName: sa.recipientName,
      addressLine1: sa.addressLine1,

      street: sa.street,
      city: sa.city,
      state: sa.state,
      postalCode: sa.pincode,
      country: sa.country,
      stateCode: sa.stateCode,
    };

    const customer: InvoiceCustomer = {
      name: orderInfo.customerName,
      phone: orderInfo.customerPhone,
      email: orderInfo.customerEmail,
      billingAddress: { ...shippingAddress }, // same as shipping unless you split it
      shippingAddress,
      placeOfSupply: sa.state,
      placeOfDelivery: sa.state,
    };

    // ── 7. Footer ─────────────────────────────────────────────────
    let signatoryDataUri: string | undefined;
    if (config?.signatory_signature_url) {
      const sigBuf = await fetchImageAsBuffer(
        config.signatory_signature_url,
      ).catch(() => null);
      if (sigBuf) {
        signatoryDataUri = `data:image/png;base64,${sigBuf.toString('base64')}`;
      }
    }

    const defaultTerms = [
      'Goods once sold cannot be taken back or exchanged.',
      'We are not the manufacturers; the company will stand for warranty as per their terms.',
      'Interest @24% p.a. will be charged for uncleared bills beyond 15 days.',
      'Subject to local jurisdiction.',
    ].join('\n');

    const footer: InvoiceFooter = {
      termsAndConditions: config?.invoice_terms_and_conditions ?? defaultTerms,
      notes: config?.invoice_footer_text ?? 'Thank you for your business.',
      signatoryName: config?.signatory_name ?? 'Authorized Signatory',
      signatoryDesignation: config?.signatory_designation ?? undefined,
      signatorySignatureDataUri: signatoryDataUri,
      footerDisclaimer:
        'Please note that this invoice is not a demand for payment.',
    };

    // ── 8. Meta ───────────────────────────────────────────────────
    const meta: InvoiceMeta = {
      invoiceNumber,
      invoiceDate: new Date(),
      orderNumber: orderId,
      orderDate: orderInfo.orderDate,
      templateId,
    };
    const legalPayload: InvoiceLegal = {
      legalName: legal?.legal_name ?? vendorInfo.companyName,
      supportEmail: legal?.support_email ?? undefined,
      supportPhone: legal?.support_phone ?? undefined,
      websiteUrl: legal?.website_url ?? undefined,
      taxIds,
    };
    return {
      meta,
      branding: brandingPayload,
      seller,
      customer,
      legal: legalPayload,
      items,
      totals,
      payment: paymentInfo,
      footer,
    };
  }
}
