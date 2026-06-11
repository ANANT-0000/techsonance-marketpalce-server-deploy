import {
  COMPANY_IDENTITY_BRANDING_VALUE,
  CompanyIdentityErrorKeyEnum,
  CompanyIdentityHomepageSectionEnum,
} from './company-identity.enums';

export const COMPANY_IDENTITY_MESSAGES = {
  COMPANY_NOT_FOUND: 'Company not found',
  FETCH_FAILED: (resource: CompanyIdentityErrorKeyEnum) =>
    `Failed to fetch ${resource}`,
  UPSERT_FAILED: (resource: CompanyIdentityErrorKeyEnum) =>
    `Failed to upsert ${resource}`,
  UPLOAD_FAILED: (resource: CompanyIdentityErrorKeyEnum) =>
    `Failed to upload ${resource}`,
} as const;

export const COMPANY_IDENTITY_BRANDING_DEFAULTS = {
  primary_color: COMPANY_IDENTITY_BRANDING_VALUE.PRIMARY_COLOR,
  secondary_color: null,
  accent_color: null,
  font_family: COMPANY_IDENTITY_BRANDING_VALUE.FONT_FAMILY,
  logo_url: COMPANY_IDENTITY_BRANDING_VALUE.EMPTY_LOGO_URL,
  logo_dark_url: null,
  watermark_url: null,
  favicon_url: null,
  background_color: COMPANY_IDENTITY_BRANDING_VALUE.BACKGROUND_COLOR,
  text_color: COMPANY_IDENTITY_BRANDING_VALUE.TEXT_COLOR,
  navbar_bg: COMPANY_IDENTITY_BRANDING_VALUE.NAVBAR_BG,
  navbar_fg: COMPANY_IDENTITY_BRANDING_VALUE.NAVBAR_FG,
  footer_bg: COMPANY_IDENTITY_BRANDING_VALUE.FOOTER_BG,
  footer_fg: COMPANY_IDENTITY_BRANDING_VALUE.FOOTER_FG,
  navbar_position: COMPANY_IDENTITY_BRANDING_VALUE.NAVBAR_POSITION,
  logo_alignment: COMPANY_IDENTITY_BRANDING_VALUE.LOGO_ALIGNMENT,
  footer_style: COMPANY_IDENTITY_BRANDING_VALUE.FOOTER_STYLE,
  border_radius: COMPANY_IDENTITY_BRANDING_VALUE.BORDER_RADIUS,
  card_style: COMPANY_IDENTITY_BRANDING_VALUE.CARD_STYLE,
  homepage_layout: [
    CompanyIdentityHomepageSectionEnum.HERO,
    CompanyIdentityHomepageSectionEnum.CATEGORIES,
    CompanyIdentityHomepageSectionEnum.PRODUCTS,
    CompanyIdentityHomepageSectionEnum.PROMO,
    CompanyIdentityHomepageSectionEnum.NEW_ARRIVALS,
    CompanyIdentityHomepageSectionEnum.NEWSLETTER,
  ],
} as const;
