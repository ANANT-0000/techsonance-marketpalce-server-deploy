import { CmsImageMimeTypeEnum } from './cms.enums';

export const CMS_MESSAGES = {
  INVALID_JSON_CONTENT: 'CMS content must be valid JSON',
  INVALID_JSON_OBJECT: 'CMS content must be a JSON object',
  INVALID_HEX_COLOR: (key: string) =>
    `${key} must be a valid hex color code (e.g. #2563eb)`,
  NAVBAR_LINKS_MUST_BE_ARRAY: 'Navbar links must be an array',
  FOOTER_SECTIONS_MUST_BE_ARRAY: 'Footer sections must be an array',
  COMPANY_NOT_FOUND: (domain: string) =>
    `Company not found for domain: ${domain}`,
  PAGE_NOT_FOUND: (pageContentType: string) =>
    `CMS page for ${pageContentType} not found`,
  PAGE_UPDATED_SUCCESS: 'CMS Page updated successfully',
  PAGE_CREATED_SUCCESS: 'CMS Page created successfully',
  PAGE_SAVE_FAILED: 'Failed to save CMS page content',
  IMAGE_REQUIRED: 'No image file provided.',
  IMAGE_FORMAT_INVALID:
    'Invalid file format. Only JPG, PNG, WEBP, and GIF are allowed.',
  IMAGE_SIZE_EXCEEDED: 'File size exceeds 5MB limit.',
  IMAGE_UPLOAD_FAILED: 'Failed to upload image',
  IMAGE_UPLOAD_SUCCESS: 'Image uploaded successfully',
  IMAGE_UPLOAD_MISSING_URL: 'No secure URL returned',
  IMAGE_DELETE_SUCCESS: 'Image deleted successfully',
  IMAGE_DELETE_FAILED: 'Failed to delete image',
  INVALID_IMAGE_URL: 'Invalid image URL',
} as const;

export const CMS_THEME_COLOR_KEYS = [
  'primary_color',
  'secondary_color',
  'background_color',
  'text_color',
  'navbar_bg',
  'navbar_fg',
  'footer_bg',
  'footer_fg',
] as const;

export const CMS_ALLOWED_IMAGE_MIME_TYPES = [
  CmsImageMimeTypeEnum.JPEG,
  CmsImageMimeTypeEnum.PNG,
  CmsImageMimeTypeEnum.WEBP,
  CmsImageMimeTypeEnum.GIF,
] as const;

export const CMS_IMAGE_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
