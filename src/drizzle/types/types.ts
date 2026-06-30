import { Role } from '../../enums/role.enum';

export enum NavLayoutType {
  NONE = 'none',
  DIRECTORY = 'directory',
  GRID = 'grid',
}
export enum PaymentMethod {
  COD = 'COD',
  PREPAID = 'Prepaid',
}
export enum UserRole {
  ADMIN = 'admin',
  VENDOR = 'vendor',
  CUSTOMER = 'customer',
}
export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING = 'pending',
  REJECTED = 'rejected',
}
export enum EntityStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DELETED = 'deleted',
}
export enum AccessStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PENDING = 'pending',
  SUSPENDED = 'suspended',
  BLOCKED = 'blocked',
}
export enum SupportTicketStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}
export enum SupportTicketPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}
export enum ProductStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DISCONTINUED = 'discontinued',
  DRAFT = 'draft',
}
export enum OrderStatus {
  // Existing e-commerce core states
  PENDING = 'pending',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  RETURNED = 'returned',
  REFUNDED = 'refunded',
  REPLACED = 'replaced',

  // Granular logistics states
  DRAFTING = 'drafting',
  AWB_ASSIGNED = 'awb_assigned',
  IN_TRANSIT = 'in_transit',
  OUT_FOR_DELIVERY = 'out_for_delivery',
  OUT_FOR_DELIVERY_EXCEPTION = 'out_for_delivery_exception',
  UNDELIVERED = 'undelivered',
  RTO = 'rto',
  FAILED = 'failed',
}
export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled',
}
/**
 * Represents the shipping status of an order.
 *
 * @enum {string}
 *
 * @remarks
 * **Exception:** This enum deviates from the general codebase convention of using lowercase members.
 * It is defined in UPPERCASE to ensure alignment with:
 * 1. External logistics API payloads (such as Shiprocket webhooks) which return uppercase statuses.
 * 2. Database constraints and defaults (`shipping_status` column in `shipping_details` table defaults to `'PENDING'`).
 */
export enum ShippingStatus {
  PENDING = 'PENDING',
  DRAFTING = 'DRAFTING',
  AWB_ASSIGNED = 'AWB_ASSIGNED',
  SHIPPED = 'SHIPPED',
  IN_TRANSIT = 'IN_TRANSIT',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  OUT_FOR_DELIVERY_EXCEPTION = 'OUT_FOR_DELIVERY_EXCEPTION',
  UNDELIVERED = 'UNDELIVERED',
  DELIVERED = 'DELIVERED',
  RETURNED = 'RETURNED',
  RTO = 'RTO',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
}
export enum ReturnType {
  RETURN = 'return',
  REFUND = 'refund',
  REPLACEMENT = 'replacement',
}
export enum ReturnReplaceMode {
  NONE = 'none',
  RETURN_ONLY = 'return_only',
  REPLACE_ONLY = 'replace_only',
  BOTH = 'both',
}
export enum PolicyDurationUnit {
  DAYS = 'days',
  MONTHS = 'months',
  YEARS = 'years',
  LIFETIME = 'lifetime',
}
export enum PolicyType {
  WARRANTY = 'warranty',
  GUARANTEE = 'guarantee',
  EXCHANGE_ONLY = 'exchange_only',
  NO_RETURN = 'no_return',
  EXTENDED_SUPPORT = 'extended_support',
  NONE = 'none',
}
export enum ReturnStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  IN_TRANSIT = 'in_transit',
  DELIVERED = 'delivered',
  QC_PASSED = 'qc_passed',
  QC_FAILED = 'qc_failed',
  COMPLETED = 'completed',
}
export type KeyValuePair = {
  key: string;
  value: string | number | boolean | null;
};

export enum ProductImageType {
  MAIN = 'main',
  GALLERY = 'gallery',
  THUMBNAIL = 'thumbnail',
}
export enum VendorDocumentType {
  BusinessRegistration = 'business_registration',
  FinancialStatements = 'financial_statements',
  InsuranceCoverage = 'insurance_coverage',
  ComplianceCertifications = 'compliance_certifications',
  SecurityDocumentation = 'security_documentation',
  ContractAgreements = 'contract_agreements',
  VendorInformation = 'vendor_information',
  BusinessContinuityPlan = 'business_continuity_plan',
}

export enum CancelledBy {
  USER = 'customer',
  VENDOR = 'vendor',
  SYSTEM = 'system',
}
export enum RefundStatus {
  PENDING = 'pending',
  PROCESSED = 'processed',
  REJECTED = 'rejected',
}
export enum PromotionType {
  PERCENTAGE = 'percentage',
  FIXED_AMOUNT = 'fixed_amount',
  BUY_X_GET_Y = 'buy_x_get_y',
  BOGO = 'bogo',
  FREE_SHIPPING = 'free_shipping',
  TIERED_DISCOUNT = 'tiered_discount',
  BUNDLE_DEAL = 'bundle_deal',
}

export enum PromotionStatus {
  DRAFT = 'draft',
  PENDING_REVIEW = 'pending_review',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PAUSED = 'paused',
  SCHEDULED = 'scheduled',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}

export enum PromotionTargetType {
  ALL_PRODUCTS = 'all_products',
  CATEGORY = 'category',
  PRODUCT = 'product',
  VENDOR = 'vendor',
  PRODUCT_VARIANT = 'product_variant',
}

export enum PromotionRuleType {
  MIN_CART_VALUE = 'min_cart_value',
  MIN_QTY = 'min_qty',
  CUSTOMER_SEGMENT = 'customer_segment',
  FIRST_ORDER_ONLY = 'first_order_only',
  PRODUCT_IN_CART = 'product_in_cart',
  NEW_CUSTOMER = 'new_customer',
  DATE_RANGE = 'date_range',
  MAX_USES_PER_USER = 'max_uses_per_user',
}

export enum BannerPlacement {
  HOMEPAGE_HERO = 'homepage_hero',
  HOMEPAGE_SECONDARY = 'homepage_secondary',
  CATEGORY_TOP = 'category_top',
  PRODUCT_PAGE = 'product_page',
  CART_SIDEBAR = 'cart_sidebar',
  CHECKOUT_TOP = 'checkout_top',
  MY_OFFERS_PAGE = 'my_offers_page',
}

export enum PromoEventType {
  VIEWED = 'viewed',
  CLICKED = 'clicked',
  APPLIED = 'applied',
  REDEEMED = 'redeemed',
  REMOVED = 'removed',
  DISMISSED = 'dismissed',
}

export enum SegmentCriteriaOperator {
  AND = 'AND',
  OR = 'OR',
}

export enum ChangelogAction {
  CREATED = 'created',
  UPDATED = 'updated',
  SUBMITTED = 'submitted',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  PAUSED = 'paused',
  RESUMED = 'resumed',
  EXPIRED = 'expired',
  DELETED = 'deleted',
}

export enum SubscriptionStatus {
  TRIAL = 'trial',
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  GRACE_PERIOD = 'grace_period',
}

/**
 * Represents the configuration modes for logistics management.
 *
 * @enum {string}
 *
 * @remarks
 * **Exception:** This enum deviates from the general codebase convention of using lowercase members.
 * It is defined in UPPERCASE to ensure alignment with:
 * 1. Third-party logistics API integrations.
 * 2. Database schemas and custom postgres enums where they are stored as 'STANDALONE' or 'PLATFORM_PROXY'.
 */
export enum LogisticsMode {
  STANDALONE = 'STANDALONE',
  PLATFORM_PROXY = 'PLATFORM_PROXY',
}

/**
 * Represents which billing account is used for shipping label creation and charges.
 *
 * @enum {string}
 *
 * @remarks
 * **Exception:** This enum deviates from the general codebase convention of using lowercase members.
 * It is defined in UPPERCASE to ensure alignment with:
 * 1. Database constraints where the column is restricted to 'VENDOR_OWN' or 'PLATFORM_MASTER'.
 * 2. Third-party integrations requesting uppercase billing configurations.
 */
export enum BillingAccountUsed {
  VENDOR_OWN = 'VENDOR_OWN',
  PLATFORM_MASTER = 'PLATFORM_MASTER',
}
/**
 * Represents the external logistics providers integrated with the system.
 *
 * @enum {string}
 *
 * @remarks
 * **Exception:** This enum deviates from the general codebase convention of using lowercase members.
 * It is defined in UPPERCASE to match external shipping APIs (e.g. Shiprocket) and database varchar limits/defaults.
 */
export enum LogisticsProvider {
  SHIPROCKET = 'SHIPROCKET',
}
// ================================================================
// DISCOUNT CONFIG TYPE HELPERS (add to ../../drizzle/types/promotions.ts)
// ================================================================

export type PercentageOffConfig = {
  value: number; // e.g. 20 (= 20%)
  cap?: number; // max discount in ₹; undefined = no cap
};

export type FixedAmountConfig = {
  value: number; // flat ₹ discount
};

export type BuyXGetYConfig = {
  buy_qty: number; // items customer must buy
  get_qty: number; // items given free / discounted
  get_product_variant_id?: string; // specific free item; null = cheapest in cart
  get_discount_percent: number; // 100 = free; 50 = half price
};

export type FreeShippingConfig = {
  max_shipping_waived?: number; // cap on shipping fee waived; undefined = all
};

export type TieredDiscountConfig = {
  tiers: Array<{
    min_cart: number; // cart subtotal threshold in ₹
    percent: number; // discount percent at this tier
  }>;
};

export type BundleDealConfig = {
  product_variant_ids: string[]; // all must be in cart
  bundle_price: number; // total price for the bundle
};

export type DiscountConfig =
  | PercentageOffConfig
  | FixedAmountConfig
  | BuyXGetYConfig
  | FreeShippingConfig
  | TieredDiscountConfig
  | BundleDealConfig;

// ────────────────────────────────────────────────────────────────
// PROMOTION EVALUATION RESULT TYPE
// Returned by PromotionService.evaluateCart() to the frontend
// ────────────────────────────────────────────────────────────────

export type DiscountLine = {
  promotion_id: string;
  promotion_name: string;
  promotion_type: string;
  coupon_code: string | null;
  discount_amount: number;
  applied_to: 'cart' | 'item' | 'shipping';
  item_discounts?: Array<{
    order_item_id: string;
    product_variant_id: string;
    unit_discount: number;
    discounted_qty: number;
  }>;
};

export type CartEvaluationResult = {
  subtotal_before_discount: number;
  total_discount: number;
  subtotal_after_discount: number;
  shipping_discount: number;
  final_total: number;
  applied_promotions: Array<{
    promotion_id: string;
    name: string;
    promotion_type: string;
    coupon_code: string | null;
  }>;
  eligible_but_not_applied: Array<{
    promotion_id: string;
    name: string;
    reason_not_applied: string;
    // e.g. "Exclusive promotion — removes other discounts"
    // e.g. "Add ₹200 more to qualify"
    shortfall?: number;
  }>;
  discount_lines: DiscountLine[];
};

export interface VendorType {
  user_role: Role;
  store_name: string;
  phone_number: string;
  store_owner_first_name: string;
  store_owner_last_name: string;
  company_structure: string;
  company_domain: string;
  store_description?: string;
  category: string;
  email: string;
  first_name: string;
  last_name: string;
  hash_password: string;
  country_code: string;
}

export enum NavbarErrorCode {
  NAVBAR_TENANT_MISMATCH = 'NAVBAR_TENANT_MISMATCH',
  NAVBAR_INVALID_ROUTE = 'NAVBAR_INVALID_ROUTE',
  NAVBAR_ROOT_REQUIRED = 'NAVBAR_ROOT_REQUIRED',
  NAVBAR_ROOT_FORBIDDEN = 'NAVBAR_ROOT_FORBIDDEN',
  NAVBAR_ROOT_NOT_FOUND = 'NAVBAR_ROOT_NOT_FOUND',
  NAVBAR_CATEGORY_CYCLE = 'NAVBAR_CATEGORY_CYCLE',
  NAVBAR_INVALID_LAYOUT = 'NAVBAR_INVALID_LAYOUT',
}

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  href: string;
  displayImage?: string;
  children?: CategoryNode[];
}

export interface NavItemPayload {
  id: string;
  label: string;
  href: string;
  layout_type: NavLayoutType;
  root_category_id?: string | null;
  categories?: CategoryNode[];
  isEmptyTree?: boolean;
}

export enum ShippingChargeStrategy {
  DYNAMIC_CUSTOMER_RATE = 'DYNAMIC_CUSTOMER_RATE',
  STANDARD_FLAT_RATE = 'STANDARD_FLAT_RATE',
}

export enum PaymentRoutingStatus {
  VAULTED = 'VAULTED',
  ROTATED = 'ROTATED',
  SUSPENDED = 'SUSPENDED',
}
