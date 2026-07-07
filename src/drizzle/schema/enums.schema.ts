import * as pg from 'drizzle-orm/pg-core';
import {
  AccessStatus,
  BannerPlacement,
  BillingAccountUsed,
  CancelledBy,
  ChangelogAction,
  CredentialType,
  EntityStatus,
  LogisticsMode,
  NavItemType,
  NavLayoutType,
  OrderStatus,
  PaymentGatewayProvider,
  PaymentRoutingStatus,
  PaymentStatus,
  PolicyDurationUnit,
  PolicyType,
  ProductImageType,
  ProductStatus,
  PromoEventType,
  PromotionRuleType,
  PromotionStatus,
  PromotionTargetType,
  PromotionType,
  RefundStatus,
  ReturnReplaceMode,
  ReturnStatus,
  ReturnType,
  SegmentCriteriaOperator,
  ShippingChargeStrategy,
  ShippingStatus,
  ShippingStrategy,
  SubscriptionStatus,
  SupportTicketPriority,
  SupportTicketStatus,
  UserRole,
  UserStatus,
  PlanStatus,
  PriceInterval,
  SyncStatus,
  FeatureType,
  JobStatus,
} from '../types/types.js';
export enum NavItemDisplayType {
  CATEGORY_LISTING = 'category_listing',
  DYNAMIC_SUBCATEGORIES = 'dynamic_subcategories',
  PRODUCT_RANGES = 'product_ranges',
  CATEGORY_DIRECTORY = 'category_directory',
  CATEGORY_LISTING_VISUAL = 'category_listing_visual',
}
export enum NavItemColType {
  SUBCATEGORIES = 'subcategories',
  BRANDS = 'brands',
  PROMOTION = 'promotion',
  PRODUCTS = 'products',
}
export enum NavMenuPosition {
  STICKY = 'sticky',
  RELATIVE = 'relative',
}
export enum NavMenuLogoAlignment {
  LEFT = 'left',
  CENTER = 'center',
}
export enum NavMenuType {
  SIMPLE = 'simple',
  MEGA = 'mega',
}

export const EntityStatusEnum = pg.pgEnum('entity_status_enum', EntityStatus);
export const LogisticsModeEnum = pg.pgEnum('logistics_mode_enum', [
  LogisticsMode.PLATFORM_PROXY,
  LogisticsMode.STANDALONE,
]);
export const BillingAccountUsedEnum = pg.pgEnum('billing_account_used_enum', [
  BillingAccountUsed.PLATFORM_MASTER,
  BillingAccountUsed.VENDOR_OWN,
]);
export const ShippingStrategyEnum = pg.pgEnum('shipping_strategy_enum', [
  ShippingStrategy.LOWEST_COST,
  ShippingStrategy.FASTEST,
  ShippingStrategy.HYBRID,
  ShippingStrategy.PRIORITY,
]);
export const companyEnum = pg.pgEnum('company_enum', EntityStatus);
export const AccessStatusEnum = pg.pgEnum('access_status_enum', AccessStatus);
export const UserRoleEnum = pg.pgEnum('user_role_enum', [
  UserRole.ADMIN,
  UserRole.VENDOR,
  UserRole.CUSTOMER,
]);

export const NavLayoutTypeEnum = pg.pgEnum('nav_layout_type_enum', [
  NavLayoutType.NONE,
  NavLayoutType.DIRECTORY,
  NavLayoutType.GRID,
]);
export const NavItemTypeEnum = pg.pgEnum('nav_item_type_enum', [
  NavItemType.CUSTOM_LINK,
  NavItemType.CATEGORY,
]);
// Policy type enum — covers all real-world cases
export const policyTypeEnum = pg.pgEnum('policy_type_enum', PolicyType);

export const policyDurationUnitEnum = pg.pgEnum(
  'policy_duration_unit_enum',
  PolicyDurationUnit,
);

export const returnReplaceModeEnum = pg.pgEnum(
  'return_replace_mode_enum',
  ReturnReplaceMode,
);
export const promotionTypeEnum = pg.pgEnum(
  'promotion_type_enum',
  PromotionType,
);

export const promotionStatusEnum = pg.pgEnum(
  'promotion_status_enum',
  PromotionStatus,
);

export const promotionTargetTypeEnum = pg.pgEnum(
  'promotion_target_type_enum',
  PromotionTargetType,
);

export const promotionRuleTypeEnum = pg.pgEnum(
  'promotion_rule_type_enum',
  PromotionRuleType,
);

export const bannerPlacementEnum = pg.pgEnum(
  'banner_placement_enum',
  BannerPlacement,
);

export const promoEventTypeEnum = pg.pgEnum(
  'promo_event_type_enum',
  PromoEventType,
);

export const segmentCriteriaOperatorEnum = pg.pgEnum(
  'segment_criteria_operator_enum',
  SegmentCriteriaOperator,
);

export const changelogActionEnum = pg.pgEnum(
  'changelog_action_enum',
  ChangelogAction,
);
export const shipping_status_enum = pg.pgEnum(
  'shipping_status_enum',
  ShippingStatus,
);
export const payment_status_enum = pg.pgEnum(
  'payment_status_enum',
  PaymentStatus,
);
export const productImageTypeEnum = pg.pgEnum(
  'product_image_type_enum',
  ProductImageType,
);
export const subscriptionStatusEnum = pg.pgEnum(
  'subscription_status_enum',
  SubscriptionStatus,
);

export const UserStatusEnum = pg.pgEnum('user_status_enum', UserStatus);
export const support_tickets_status_enum = pg.pgEnum(
  'support_tickets_status_enum',
  SupportTicketStatus,
);
export const support_tickets_priority_enum = pg.pgEnum(
  'support_tickets_priority_enum',
  SupportTicketPriority,
);
export const ShippingChargeStrategyEnum = pg.pgEnum(
  'shipping_charge_strategy_enum',
  [
    ShippingChargeStrategy.DYNAMIC_CUSTOMER_RATE,
    ShippingChargeStrategy.STANDARD_FLAT_RATE,
  ],
);

export const PaymentRoutingStatusEnum = pg.pgEnum(
  'payment_routing_status_enum',
  [
    PaymentRoutingStatus.VAULTED,
    PaymentRoutingStatus.ROTATED,
    PaymentRoutingStatus.SUSPENDED,
  ],
);

export const GatewayTypeEnum = pg.pgEnum(
  'gateway_type_enum',
  PaymentGatewayProvider,
);

export const CredentialTypeEnum = pg.pgEnum(
  'credential_type_enum',
  CredentialType,
);
export const refund_status_enum = pg.pgEnum('refund_status_enum', RefundStatus);
export const returnTypeEnum = pg.pgEnum('return_type_enum', ReturnType);

export const returnStatusEnum = pg.pgEnum('return_status_enum', ReturnStatus);
export const cancelledByEnum = pg.pgEnum('canceled_by_enum', CancelledBy);
export const order_status_enum = pg.pgEnum('order_status_enum', OrderStatus);
export const ProductStatusEnum = pg.pgEnum(
  'product_status_enum',
  ProductStatus,
);

export const planStatusEnum = pg.pgEnum('plan_status_enum', [
  PlanStatus.DRAFT,
  PlanStatus.LIVE,
  PlanStatus.ARCHIVED,
]);
export const priceIntervalEnum = pg.pgEnum('price_interval_enum', [
  PriceInterval.MONTHLY,
  PriceInterval.YEARLY,
  PriceInterval.CUSTOM,
]);
export const syncStatusEnum = pg.pgEnum('sync_status_enum', [
  SyncStatus.PENDING,
  SyncStatus.SYNCED,
  SyncStatus.ERROR,
]);
export const featureTypeEnum = pg.pgEnum('feature_type_enum', [
  FeatureType.BOOLEAN,
  FeatureType.NUMBER,
  FeatureType.TEXT,
]);
export const jobStatusEnum = pg.pgEnum('job_status_enum', [
  JobStatus.PENDING,
  JobStatus.PROCESSING,
  JobStatus.COMPLETED,
  JobStatus.FAILED,
]);
