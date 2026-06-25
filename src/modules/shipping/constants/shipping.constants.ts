// Cryptography Constants
export const CRYPTO_ALGORITHM = 'aes-256-gcm';
export const CRYPTO_KEY_ENV = 'PROCESS_ENV_LOGISTICS_CIPHER';
export const CRYPTO_DEFAULT_KEY = 'my-super-secret-logistics-cipher-key-32-chars';
export const CRYPTO_HASH_ALGORITHM = 'sha256';
export const CRYPTO_ENCODING_UTF8 = 'utf8';
export const CRYPTO_ENCODING_HEX = 'hex';
export const CRYPTO_IV_LENGTH = 12;
export const CRYPTO_SEPARATOR = ':';
export const CRYPTO_EXPECTED_PARTS = 3;
export const CRYPTO_ERROR_INVALID_FORMAT = 'Invalid cipher text format';

// Shipping Service & Manager Constants
export const SHIPPING_ITEM_FALLBACK_NAME = 'Item';
export const SHIPPING_COMPANY_NOT_FOUND_MSG = 'Company not found';
export const SHIPPING_SETTINGS_UPDATED_MSG = 'Shipping settings updated successfully';
export const SHIPPING_API_KEY_PLACEHOLDER = '********';
export const SHIPPING_PAYMENT_METHOD_PREPAID = 'Prepaid' as const;
export const SHIPPING_DEFAULT_PICKUP_LOCATION = 'Delhi Warehouse';

// Logistics Provider States & Audit Action Names
export const SHIPROCKET_DRAFT_ORDER_SUCCESS_ACTION = 'SHIPROCKET_DRAFT_ORDER_SUCCESS';
export const SHIPROCKET_DRAFT_ORDER_FAILURE_ACTION = 'SHIPROCKET_DRAFT_ORDER_FAILURE';
export const SHIPROCKET_WEBHOOK_RECEIVED_ACTION = 'SHIPROCKET_WEBHOOK_RECEIVED';

export const SHIPPING_ENTITY_SHIPPING_DETAILS = 'shipping_details';
export const SHIPPING_ENTITY_ORDERS = 'orders';

export const SHIPPING_STATUS_AWB_ASSIGNED = 'AWB_ASSIGNED';
export const SHIPPING_STATUS_DELIVERED = 'DELIVERED';
export const SHIPPING_STATUS_RTO = 'RTO';
export const SHIPPING_STATUS_RETURNED = 'RETURNED';
export const SHIPPING_STATUS_CANCELLED = 'CANCELLED';

export const LOGISTICS_PARTNER_FALLBACK_NAME = 'Shiprocket Partner';
export const BILLING_ACCOUNT_PLATFORM_MASTER = 'PLATFORM_MASTER';
export const ZERO_PRICE_STRING = '0.00';
