export interface ProductFiles {
  product?: Express.Multer.File[];
  product_spec?: Express.Multer.File[];
}
export enum AddressType {
  BUSINESS = 'business',
  WAREHOUSE = 'warehouse',
  WORK = 'work',
  HOME = 'home',
  OTHER = 'other',
}

export interface ComplianceField {
  value: string;
  label: string;
  placeholder: string;

  required: boolean;
  requiredForSelling: boolean;

  showOnInvoice: boolean;
  editableAtCheckout: boolean;

  affectsTaxCalculation: boolean;

  is_primary_tax_id: boolean;

  helperText: string;

  taxRule?: string;
}

export interface TaxConfig {
  currency: string;

  hasVat?: boolean;
  hasStateTax?: boolean;

  vatRate?: number;

  invoiceRules?: string[];
}

export interface CountryCompliance {
  country_code: string;
  country_name: string;

  taxConfig: TaxConfig;

  fields: ComplianceField[];
}
