import { promotionTargetsRelations } from './../../../drizzle/schema/promotions.schema';
import { Buffer } from 'buffer';

// ================================================================
// RAW DB SHAPE TYPES
// Mirror the Drizzle schema exactly — used in fetchOrderWithRelations
// ================================================================

export interface DbAddress {
  address_line_1: string;

  street: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  landmark?: string;
  name?: string; // recipient name stored on address row
  number?: string; // phone stored on address row
}

export interface Warehouse {
  id: string;
  warehouse_name: string;
  address: DbAddress | null;
}

export interface OrderItem {
  id: string;
  quantity: number;
  price: string; // Drizzle returns decimals as strings
  company_id: string;
  variant: {
    sku: string;
    product: {
      name: string;
      description: string;
      vendor: {
        store_name: string;
        user: {
          phone_number: string | null;
          email: string;
        };
      } | null;
    } | null;
    inventory: {
      warehouse: Warehouse;
    } | null;
  } | null;
}

export interface OrderWithRelations {
  id: string;
  company_id: string;
  created_at: Date;

  promotionUsage: {
    promotion_id: string;
    order_id: string;
    discount_amount: string;
  };
  promotionAnalyticsEvents: {
    id: string;
    promotion_id: string;
    event_type: string;
    discount_amount: string;
  };
  customer: {
    first_name: string | null;
    last_name: string | null;
    phone_number: string | null;
    email: string;
  };
  address: DbAddress;
  items: OrderItem[];
}

export interface WarehouseGroup {
  warehouse: Warehouse;
  items: OrderItem[];
}

export interface GroupingResult {
  assigned: Map<string, WarehouseGroup>;
  unresolved: OrderItem[];
}

// ── Mapped (cleaned) info objects passed into buildPayload ────────

export interface MappedOrderInfo {
  id: string;
  orderDate: Date;
  customerName: string;
  customerPhone: string | undefined;
  customerEmail: string;
  discountAmount: number;
  shippingAddress: {
    recipientName: string;
    addressLine1: string;

    street?: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
    stateCode?: string; // e.g. "24" for Gujarat
  };
}

export interface MappedVendorInfo {
  companyName: string;
  gstNumber: string;
  panNumber: string;
  mobileNumber: string | undefined;
  email: string;
}

// ── Company context fetched from DB ──────────────────────────────

export interface companyConfig {
  invoice_number_prefix: string | null;
  invoice_number_format: string | null;
  invoice_sequence_counter: number | null;
  invoice_sequence_reset: string | null;
  default_invoice_template_id: string | null;
  signatory_name: string | null;
  signatory_designation: string | null;
  signatory_signature_url: string | null;
  invoice_footer_text: string | null;
  invoice_terms_and_conditions: string | null;
  default_currency: string | null;
  default_timezone: string | null;
  date_format: string | null;
  default_invoice_template?: {
    id: string;
    template_name: string;
    template_url: string | null;
    created_at: string | Date;
    updated_at: string | Date;
    company_id: string | null;
    vendor_id: string | null;
  } | null;
}

export interface companyLegal {
  id: string;
  company_id: string;
  legal_name: string;

  country_code: string;
  registered_address_id: string | null;
  support_email: string | null;
  support_phone: string | null;
  website_url: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface companyBranding {
  id: string;
  company_id: string;
  logo_url: string;
  logo_dark_url: string | null;
  watermark_url: string | null;
  favicon_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  font_family: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface CompanyContext {
  config: companyConfig | null;
  branding: companyBranding | null;
  legal: companyLegal | null;
}

// ================================================================
// STANDARDIZED INVOICE PAYLOAD
// The ONE object every template receives. Templates never touch DB.
// ================================================================

/**
 * Per-line GST breakdown — matches Amazon invoice format:
 *   unitPrice (excl tax) | discount | qty | netAmount | taxRate | taxType | taxAmount | totalAmount
 */
export interface InvoiceLineItem {
  /** Product display name */
  name: string;
  /** HSN / SAC code */
  hsnCode?: string;
  /** Variant description, color, size etc. */
  description?: string;
  /** SKU / ASIN-equivalent for internal reference */
  sku?: string;
  quantity: number;
  /** Unit price EXCLUDING tax */
  unitPrice: number;
  /** Discount amount at line level (0 if none) */
  discount: number;
  /** unitPrice × qty − discount */
  netAmount: number;
  /** Tax rate as a percentage, e.g. 18 */
  taxRate: number;
  /**
   * Tax type label: 'CGST' | 'SGST' | 'IGST'
   * Derived from whether supply is intra-state or inter-state.
   */
  taxType: 'CGST+SGST' | 'IGST' | 'EXEMPT';
  /** Tax amount for this line */
  taxAmount: number;
  /** netAmount + taxAmount */
  totalAmount: number;
}

export interface InvoiceTotals {
  subTotal: number; // Σ (unitPrice × qty) before discount
  totalDiscount: number; // Σ discounts across all lines
  netAmount: number; // subTotal − totalDiscount
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalTax: number; // totalCgst + totalSgst OR totalIgst
  grandTotal: number; // netAmount + totalTax
  currency: string; // ISO 4217, e.g. "INR"
  grandTotalInWords?: string;
  reverseCharge: boolean; // "Whether tax is payable under reverse charge"
}

/** Full structured address — used for both seller and buyer blocks */
export interface InvoiceAddress {
  recipientName: string;
  companyName?: string;
  addressLine1: string;

  street?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  stateCode?: string; // e.g. "24" for Gujarat (shown as "State/UT Code: 24")
}

export interface InvoiceCustomer {
  name: string;
  phone?: string;
  email?: string;
  billingAddress: InvoiceAddress;
  shippingAddress: InvoiceAddress;
  placeOfSupply?: string; // e.g. "GUJARAT"
  placeOfDelivery?: string; // usually same as placeOfSupply
}

export interface InvoiceSeller {
  legalName: string;
  tradeName?: string;
  /** Full registered address of the seller (warehouse / company) */
  address: InvoiceAddress;
  /** Ordered list of tax/compliance IDs: GSTIN, PAN, CIN, FSSAI … */
  taxIds: Array<{ key: string; value: string }>;
  supportEmail?: string;
  supportPhone?: string;
  websiteUrl?: string;
}

export interface InvoiceBranding {
  logoUrl?: string;
  /** Pre-fetched logo bytes — avoids an extra HTTP call inside the template */
  logoBuffer?: Buffer;
  primaryColor: string;
  secondaryColor?: string;
  accentColor?: string;
  watermarkUrl?: string | null;
  fontFamily?: string;
}

export interface InvoiceMeta {
  invoiceNumber: string;
  invoiceDate: Date;
  orderNumber: string; // the source order ID / order number
  orderDate: Date;
  dueDate?: Date;
  templateId: string;
}

export interface InvoicePaymentInfo {
  transactionId?: string;
  paymentMethod?: string;
  invoiceValue?: number;
  paidAt?: Date;
}

export interface InvoiceFooter {
  termsAndConditions?: string;
  notes?: string | null;
  signatoryName?: string;
  signatoryDesignation?: string;
  /** Pre-fetched signature as base64 data URI: "data:image/png;base64,..." */
  signatorySignatureDataUri?: string;
  footerDisclaimer?: string; // e.g. "This is a system-generated document."
}
export interface InvoiceLegal {
  legalName: string;
  tradeName?: string;
  supportEmail?: string;
  supportPhone?: string;
  websiteUrl?: string;
  /** All active compliance fields: GSTIN, PAN, CIN etc. */
  taxIds: Array<{ key: string; value: string }>;
  /** Full formatted registered address string */
  registeredAddress?: string;
}

/**
 * The single DTO every IInvoiceTemplate.render() receives.
 * No template ever queries the database directly.
 */
export interface StandardizedInvoicePayload {
  meta: InvoiceMeta;
  branding: InvoiceBranding;
  seller: InvoiceSeller;
  legal: InvoiceLegal;
  customer: InvoiceCustomer;
  items: InvoiceLineItem[];
  totals: InvoiceTotals;
  payment?: InvoicePaymentInfo;
  footer: InvoiceFooter;
}

// ================================================================
// TEMPLATE CONTRACT
// ================================================================

export interface IInvoiceTemplate {
  readonly templateId: string;
  readonly templateLabel: string;
  render(payload: StandardizedInvoicePayload): Promise<Buffer>;
}
