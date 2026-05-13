import { Buffer } from 'buffer';
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
export interface StandardizedInvoicePayload {
  meta: {
    invoiceNumber: string;
    invoiceDate: Date;
    dueDate?: Date;
  };
  branding: {
    logoUrl?: string;
    logoBuffer?: Buffer;
    primaryColor: string;
    watermarkUrl?: string | null;
  };
  legal: {
    legalName: string;
    tradeName?: string;
    supportEmail?: string;
    supportPhone?: string;
    taxIds: Array<{ key: string; value: string }>; // e.g., GST, VAT
  };
  customer: {
    name: string;
    phone?: string;
    email?: string;
    shippingAddress: string;
    billingAddress: string;
  };
  items: Array<{
    name: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    taxAmount: number;
    taxRate: number;
    totalAmount: number;
  }>;
  totals: {
    subTotal: number;
    totalTax: number;
    grandTotal: number;
    currency: string;
  };
  footer: {
    termsAndConditions?: string;
    notes?: string | null;
    signatoryName?: string;
  };
}

// Every template MUST implement this interface
export interface IInvoiceTemplate {
  // Unique identifier for the registry (e.g., 'standard-gst', 'minimal')
  readonly templateId: string;

  // The universal render function
  render(payload: StandardizedInvoicePayload): Promise<Buffer>;
}
