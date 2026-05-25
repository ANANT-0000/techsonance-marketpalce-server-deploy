// ../../modules/invoice/invoice-payload-builder.service.ts
import {
  Injectable,
  Inject,
  InternalServerErrorException,
  NotFoundException,
  Logger,
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
    addressLine2: addr.address_line_2 || undefined,
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
    console.log(
      `[InvoicePayloadBuilderService.fetchOrderWithRelations] Request received for orderId: ${orderId}`,
    );
    console.log(
      '[InvoicePayloadBuilderService.fetchOrderWithRelations] Querying order with relations',
    );
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
    if (!orderData.items?.length)
      throw new NotFoundException(`Order ${orderId} has no items`);
    console.log(
      `[InvoicePayloadBuilderService.fetchOrderWithRelations] Order loaded with ${orderData.items.length} item(s)`,
    );
    return orderData;
  }

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC: fetch company branding / legal / config in one shot
  // ══════════════════════════════════════════════════════════════════

  async fetchCompanyContext(companyId: string): Promise<CompanyContext> {
    console.log(
      `[InvoicePayloadBuilderService.fetchCompanyContext] Request received for companyId: ${companyId}`,
    );
    console.log(
      '[InvoicePayloadBuilderService.fetchCompanyContext] Querying branding, legal, and document config',
    );
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

    // 2. Fetch the vendor GSTIN from company_compliance
    //    (the default GST registration's gst_number row)
    const defaultFlagRow = await this.db
      .select()
      .from(company_compliance)
      .where(
        and(
          eq(company_compliance.company_id, companyId),
          eq(company_compliance.country_code, 'IN'),
          eq(company_compliance.field_key, 'gst_is_default'),
          eq(company_compliance.field_value, 'true'),
          eq(company_compliance.is_active, true),
        ),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null);

    let vendorGstin: string | null = null;

    if (defaultFlagRow) {
      const gstNumberRow = await this.db
        .select()
        .from(company_compliance)
        .where(
          and(
            eq(company_compliance.company_id, companyId),
            eq(company_compliance.country_code, 'IN'),
            eq(company_compliance.field_key, 'gst_number'),
            eq(company_compliance.valid_until, defaultFlagRow.valid_until!),
            eq(company_compliance.is_active, true),
          ),
        )
        .limit(1)
        .then((rows) => rows[0] ?? null);

      vendorGstin = gstNumberRow?.field_value ?? null;
    }

    return {
      totalCgst: Number(row.cgst_amount),
      totalSgst: Number(row.sgst_amount),
      totalIgst: Number(row.igst_amount),
      totalTax: Number(row.total_tax),
      vendorGstin,
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

    const addr = order.address;
    return {
      id: order.id,
      orderDate: order.created_at,
      customerName,
      customerPhone: order.customer.phone_number ?? undefined,
      customerEmail: order.customer.email,
      shippingAddress: {
        recipientName: customerName,
        addressLine1: addr.address_line_1,
        addressLine2: addr.address_line_2 || undefined,
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

    // ── 1. Compliance IDs (GSTIN, PAN, CIN, FSSAI …) ─────────────
    // let complianceRows: (typeof company_compliance.$inferSelect)[] = [];
    // try {
    //   complianceRows = await this.db
    //     .select()
    //     .from(company_compliance)
    //     .where(eq(company_compliance.company_id, group.items[0].company_id));
    // } catch {
    //   complianceRows = [];
    // }
    // // Build taxIds from compliance table first; fall back to GST registration row
    // const taxIds: Array<{ key: string; value: string }> = complianceRows
    //   .filter((r) => r.is_active)
    //   .map((r) => ({ key: r.field_key.toUpperCase(), value: r.field_value }));

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
      .filter((r) => r.is_active && r.field_key === 'gst_number')
      .map((r) => ({ key: 'GST Registration No', value: r.field_value }));

    // Add PAN if present
    const panRow = complianceRows.find((r) => r.field_key === 'pan_number');
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

    // If no compliance rows, try gst_registrations table directly
    // if (taxIds.length === 0) {
    //   const gstRow = await this.db.query.gst_registrations
    //     .findFirst({
    //       where: eq(gst_registrations.company_id, group.items[0].company_id),
    //     })
    //     .catch(() => null);
    //   if (gstRow?.gst_number) {
    //     taxIds.push({ key: 'GST Registration No', value: gstRow.gst_number });
    //   }
    //   // Vendor GST from gst_invoices
    //   if (gstData?.vendorGstin && gstData.vendorGstin !== 'N/A') {
    //     const alreadyHasGst = taxIds.some(
    //       (t) => t.value === gstData.vendorGstin,
    //     );
    //     if (!alreadyHasGst) {
    //       taxIds.unshift({
    //         key: 'GST Registration No',
    //         value: gstData.vendorGstin,
    //       });
    //     }
    //   }
    // }

    // Determine intra/inter state from seller GSTIN vs buyer state
    const sellerGstin =
      gstData?.vendorGstin ??
      taxIds.find((t) => t.key.includes('GST'))?.value ??
      '';
    const buyerState = orderInfo.shippingAddress.state;
    const isInterStateSupply = isInterState(sellerGstin, buyerState);

    // ── 2. Line items with per-line tax breakdown ─────────────────
    let runningSubTotal = 0;
    let runningDiscount = 0;

    const items: InvoiceLineItem[] = group.items.map((item) => {
      const unitPrice = Number(item.price);
      const qty = item.quantity;
      const discount = 0; // extend here when discount schema is added
      const netAmount = unitPrice * qty - discount;

      // Distribute total tax proportionally across lines
      // until per-product tax rates are in the schema
      const taxRate = gstData
        ? (gstData.totalTax /
            (gstData.totalCgst + gstData.totalSgst + gstData.totalIgst || 1)) *
          100
        : 0;
      const lineTaxAmount = gstData
        ? Math.round(
            (netAmount / (runningSubTotal || 1)) * gstData.totalTax * 100,
          ) / 100
        : 0;

      runningSubTotal += netAmount;
      runningDiscount += discount;

      return {
        name: item.variant?.product?.name ?? 'Unknown Product',
        sku: item.variant?.sku ?? undefined,
        // description: item.variant?.product?.description ?? undefined,
        quantity: qty,
        unitPrice,
        discount,
        netAmount,
        taxRate,
        taxType: isInterStateSupply ? 'IGST' : 'CGST+SGST',
        taxAmount: lineTaxAmount,
        totalAmount: netAmount + lineTaxAmount,
      };
    });

    // Recompute line tax amounts proportionally now we have final subTotal
    if (gstData && runningSubTotal > 0) {
      let taxAssigned = 0;
      for (let i = 0; i < items.length; i++) {
        if (i === items.length - 1) {
          // Last item gets the remainder to avoid rounding drift
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
        // Also tag individual CGST / SGST rates on the item label
        if (!isInterStateSupply && gstData.totalCgst > 0) {
          const cgstRate = (gstData.totalCgst / runningSubTotal) * 100;
          items[i].taxRate = Math.round(cgstRate * 2 * 100) / 100; // total GST % = CGST% + SGST%
        } else if (isInterStateSupply && gstData.totalIgst > 0) {
          items[i].taxRate =
            Math.round((gstData.totalIgst / runningSubTotal) * 100 * 100) / 100;
        }
        items[i].totalAmount = items[i].netAmount + items[i].taxAmount;
      }
    }

    // ── 3. Totals ─────────────────────────────────────────────────
    const currency = config?.default_currency ?? 'INR';
    const totalTax = gstData?.totalTax ?? 0;
    const grandTotal = runningSubTotal + totalTax;

    const totals: InvoiceTotals = {
      subTotal: runningSubTotal + runningDiscount,
      totalDiscount: runningDiscount,
      netAmount: runningSubTotal,
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
          addressLine2: warehouseAddr.address_line_2 || undefined,
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
      addressLine2: sa.addressLine2,
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
