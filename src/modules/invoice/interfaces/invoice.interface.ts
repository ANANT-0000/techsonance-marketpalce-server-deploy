import { Buffer } from 'buffer';

// ================================================================
// RAW DB RELATION TYPES  (unchanged from your existing code)
// ================================================================

export interface WarehouseAddress {
  address_line_1: string;
  city: string;
  state: string;
  postal_code: string;
}

export interface Warehouse {
  id: string;
  warehouse_name: string;
  address: WarehouseAddress | null;
}

export interface OrderItem {
  id: string;
  quantity: number;
  price: string;
  company_id: string;
  variant: {
    product: {
      name: string;
      vendor: {
        store_name: string;
        user: {
          phone_number: string;
        };
      };
    };
    inventory: {
      warehouse: Warehouse;
    } | null;
  } | null;
}

export interface OrderWithRelations {
  id: string;
  company_id: string;
  customer: {
    first_name: string | null;
    last_name: string | null;
    phone_number: string | null;
    email: string;
  };
  address: {
    address_line_1: string;
    city: string;
    state: string;
    postal_code: string;
  };
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

export interface MappedOrderInfo {
  id: string;
  customerName: string;
  customerPhone: string;
  shippingAddress: {
    addressLine1: string;
    city: string;
    state: string;
    pincode: string;
  };
}

export interface MappedVendorInfo {
  companyName: string;
  gstNumber: string;
  mobileNumber: string;
  email: string;
}

export interface companyConfig {
  id: string;
  created_at: string | Date;
  updated_at: string | Date;
  company_id: string;
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
    company_id: string;
    vendor_id: string | null;
  } | null;
}

export interface companyLegal {
  id: string;
  company_id: string;
  legal_name: string;
  trade_name: string | null;
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
// Single DTO passed into every template — templates never touch the DB
// ================================================================

export interface InvoiceLineItem {
  /** Product name (variant name if multi-variant) */
  name: string;
  /** Optional: HSN/SAC code for GST compliance */
  hsnCode?: string;
  /** Optional: variant description, color, size, storage */
  description?: string;
  /** SKU for internal reference */
  sku?: string;
  quantity: number;
  /** Unit price EXCLUDING tax */
  unitPrice: number;
  /** Pre-computed tax amount for this line */
  taxAmount: number;
  /** Tax rate as a percentage e.g. 18 */
  taxRate: number;
  /** unitPrice × quantity + taxAmount */
  totalAmount: number;
}

export interface InvoiceTotals {
  subTotal: number; // sum of (unitPrice × qty) for all items
  totalCgst: number; // for intra-state
  totalSgst: number; // for intra-state
  totalIgst: number; // for inter-state
  totalTax: number; // totalCgst + totalSgst OR totalIgst
  grandTotal: number; // subTotal + totalTax
  currency: string; // ISO 4217 e.g. "INR"
  grandTotalInWords?: string; // optional, pre-formatted
}

export interface InvoiceCustomer {
  name: string;
  phone?: string;
  email?: string;
  shippingAddress: string; // single formatted string
  billingAddress: string; // falls back to shippingAddress
  placeOfSupply?: string; // e.g. "09-UTTARPRADESH"
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

export interface InvoiceBranding {
  /** Publicly accessible URL for the company logo */
  logoUrl?: string;
  /** Pre-fetched logo bytes (preferred — avoids network call inside template) */
  logoBuffer?: Buffer;
  primaryColor: string; // hex e.g. "#1A73E8"
  secondaryColor?: string;
  accentColor?: string;
  watermarkUrl?: string | null;
}

export interface InvoiceMeta {
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate?: Date;
  /** e.g. "standard-gst" | "minimal" | "branded" */
  templateId: string;
}

export interface InvoiceFooter {
  termsAndConditions?: string;
  notes?: string | null;
  signatoryName?: string;
  signatoryDesignation?: string;
  /** Pre-fetched signature image bytes */
  signatorySignatureBuffer?: Buffer;
}

/**
 * The ONE object every IInvoiceTemplate.render() receives.
 * All templates must accept this and only this.
 */
export interface StandardizedInvoicePayload {
  meta: InvoiceMeta;
  branding: InvoiceBranding;
  legal: InvoiceLegal;
  customer: InvoiceCustomer;
  items: InvoiceLineItem[];
  totals: InvoiceTotals;
  footer: InvoiceFooter;
}

// ================================================================
// TEMPLATE CONTRACT — every template implements this
// ================================================================

export interface IInvoiceTemplate {
  /** Must be unique across the entire registry e.g. 'standard-gst' */
  readonly templateId: string;
  /** Human-readable label shown in admin UI */
  readonly templateLabel: string;
  /** Accepts the standardized payload, returns a PDF buffer */
  render(payload: StandardizedInvoicePayload): Promise<Buffer>;
}
