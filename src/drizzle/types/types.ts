import { Role } from '../../enums/role.enum';

export enum NavLayoutType {
  NONE = 'none',
  DIRECTORY = 'directory',
  GRID = 'grid',
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
  PENDING = 'pending',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  RETURNED = 'returned',
  REFUNDED = 'refunded',
  REPLACED = 'replaced',
}
export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled',
}
export enum ShippingStatus {
  PENDING = 'pending',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  RETURNED = 'returned',
  CANCELLED = 'cancelled',
}
export enum ReturnType {
  RETURN = 'return',
  REFUND = 'refund',
  REPLACEMENT = 'replacement',
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

export enum productImageType {
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
export enum CancelledByEnum {
  USER = 'customer',
  VENDOR = 'vendor',
  SYSTEM = 'system',
}
export enum RefundStatusEnum {
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
