export enum CompanyIdentityErrorKeyEnum {
  BRANDING = 'branding',
  LEGAL_PROFILE = 'legal profile',
  COMPLIANCE_RECORDS = 'compliance records',
  DOCUMENT_CONFIG = 'document config',
  SIGNATORY_SIGNATURE = 'signatory signature',
}

export enum CompanyIdentityTemplateTokenEnum {
  INVOICE_NUMBER_PREFIX = 'INV',
  INVOICE_NUMBER_FORMAT = '{PREFIX}-{YYYY}-{SEQ8}',
  INVOICE_SEQUENCE_RESET = 'APRIL',
  DEFAULT_CURRENCY = 'INR',
  DEFAULT_TIMEZONE = 'Asia/Kolkata',
  DATE_FORMAT = 'DD/MM/YYYY',
}

export const COMPANY_IDENTITY_BRANDING_VALUE = {
  PRIMARY_COLOR: '#000000',
  FONT_FAMILY: 'Inter',
  EMPTY_LOGO_URL: '',
  BACKGROUND_COLOR: '#f8fafc',
  TEXT_COLOR: '#0f172a',
  NAVBAR_BG: '#ffffff',
  NAVBAR_FG: '#0f172a',
  FOOTER_BG: '#0f172a',
  FOOTER_FG: '#ffffff',
  NAVBAR_POSITION: 'sticky',
  LOGO_ALIGNMENT: 'left',
  FOOTER_STYLE: 'detailed',
  BORDER_RADIUS: 'md',
  CARD_STYLE: 'standard',
} as const;

export enum CompanyIdentityHomepageSectionEnum {
  HERO = 'hero',
  CATEGORIES = 'categories',
  PRODUCTS = 'products',
  PROMO = 'promo',
  NEW_ARRIVALS = 'new_arrivals',
  NEWSLETTER = 'newsletter',
}

export enum CompanyIdentityUploadFolderEnum {
  SIGNATORY_SIGNATURE = 'signatory_signature',
}
