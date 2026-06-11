import * as pg from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { company } from './main.schema';
import { EntityStatusEnum } from './enums.schema';
import { orders, order_items, coupons } from './shop.schema';
import {
  BannerPlacement,
  ChangelogAction,
  PromoEventType,
  PromotionRuleType,
  PromotionStatus,
  PromotionTargetType,
  PromotionType,
  SegmentCriteriaOperator,
  EntityStatus,
} from '../types/types';
import { user } from './users.schema';

// ================================================================
// PROMOTIONS & MARKETING SCHEMA
// Covers: promotions, rules, targets, coupons (extended), customer
// segments, banners, analytics events, and changelog.
//
// Design principles:
//   - promotions is the single source of truth; existing coupons
//     table gains a promotion_id FK (migration adds it as nullable).
//   - discount_config uses a JSON Strategy Pattern so new promotion
//     types never require a schema migration.
//   - promotion_snapshot on order_items freezes terms at purchase
//     time — vendor edits never retroactively affect fulfilled orders.
//   - All counters (total_used) are incremented atomically with
//     UPDATE … WHERE total_used < max_uses_total RETURNING id.
// ================================================================

// ─── ENUMS ──────────────────────────────────────────────────────

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

// ================================================================
// 1. PROMOTIONS
// Central entity — every discount type flows through here.
// Coupons become a sub-type: a promotion with a coupon_code.
// ================================================================

export const promotions = pg.pgTable(
  'promotions',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),

    // ── Tenant & Ownership ──
    company_id: pg
      .uuid('company_id')
      .notNull()
      .references(() => company.id, { onDelete: 'cascade' }),

    // User who created this promotion (admin or vendor user)
    created_by: pg
      .uuid('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),

    // Admin user who approved — set only when status = ACTIVE
    approved_by: pg
      .uuid('approved_by')
      .references(() => user.id, { onDelete: 'set null' }),

    // ── Identity ──
    name: pg.text('name').notNull(),
    // e.g. "Summer Sale 20% Off", "New Customer Welcome Offer"
    description: pg.text('description'),
    // Internal note shown to admins/vendors only; never shown to customers
    internal_note: pg.text('internal_note'),

    // ── Type & Config ──
    promotion_type: promotionTypeEnum('promotion_type').notNull(),

    // JSON Strategy Pattern — payload varies by promotion_type:
    //
    // percentage_off:
    //   { value: 20, cap: 500 }
    //   → 20% off, max ₹500 discount
    //
    // fixed_amount:
    //   { value: 200 }
    //   → flat ₹200 off
    //
    // buy_x_get_y:
    //   { buy_qty: 2, get_qty: 1, get_product_variant_id: "uuid", get_discount_percent: 100 }
    //   → buy 2, get 1 free (100% off); or buy 2 get 1 at 50% off
    //
    // free_shipping:
    //   { max_shipping_waived: 150 }
    //   → waive shipping up to ₹150
    //
    // tiered_discount:
    //   { tiers: [{ min_cart: 500, percent: 5 }, { min_cart: 1000, percent: 10 }] }
    //   → spend ₹500 get 5%, spend ₹1000 get 10%
    //
    // bundle_deal:
    //   { product_variant_ids: ["uuid1","uuid2"], bundle_price: 999 }
    //   → buy both variants together for ₹999
    discount_config: pg.jsonb('discount_config').notNull(),

    // ── Coupon code (optional) ──
    // Null = auto-applied (no code needed)
    // Set = customer must enter this code at cart/checkout
    coupon_id: pg
      .uuid('coupon_id')
      .references(() => coupons.id, { onDelete: 'set null' }),

    // When true, applied automatically without any code entry
    is_auto_applied: pg.boolean('is_auto_applied').notNull().default(false),

    // ── Stacking behaviour ──
    priority: pg.integer('priority').notNull().default(10),
    // Lower number = evaluated first. When is_exclusive = true,
    // this promotion blocks all others from applying.
    is_exclusive: pg.boolean('is_exclusive').notNull().default(false),
    // UUIDs of other promotions this one can stack with.
    // Empty array = no stacking allowed (other than auto-applied ones).

    // ── Status & Lifecycle ──
    status: promotionStatusEnum('status')
      .notNull()
      .default(PromotionStatus.DRAFT),
    rejection_reason: pg.text('rejection_reason'),
    // Populated when admin rejects; shown to vendor

    // ── Schedule ──
    valid_from: pg.timestamp('valid_from', { withTimezone: true }).notNull(),
    valid_to: pg.timestamp('valid_to', { withTimezone: true }),
    // null = no end date (indefinite)

    // ── Usage Caps ──
    // null = unlimited
    max_uses_total: pg.integer('max_uses_total'),
    // Per-customer cap; null = unlimited
    max_uses_per_user: pg.integer('max_uses_per_user').default(1),
    // Atomic counter — incremented via UPDATE…WHERE total_used < max_uses_total RETURNING id
    // Never update this directly from application code; use the atomic query only.
    total_used: pg.integer('total_used').notNull().default(0),

    // ── Timestamps ──
    created_at: pg.timestamp('created_at').notNull().defaultNow(),
    updated_at: pg
      .timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    record_status: EntityStatusEnum('record_status').default(EntityStatus.ACTIVE),
    deleted_at: pg.timestamp('deleted_at'),
    // Set by cron when status is moved to EXPIRED
    expired_at: pg.timestamp('expired_at', { withTimezone: true }),
  },
  (table) => [
    // Primary query: all active promos for a company on every cart evaluation
    pg
      .index('idx_promotions_company_status')
      .on(table.company_id, table.status),
    // Partial index for hot path — only ACTIVE rows
    // pg
    //   .index('idx_promotions_active')
    //   .on(table.company_id, table.valid_from, table.valid_to)
    //   .where(sql`status = '${PromotionStatus.ACTIVE}'`),
    pg
      .index('idx_promotions_coupon_id')
      .on(table.company_id, table.coupon_id)
      .where(sql`coupon_id IS NOT NULL`),
    // Uniqueness: one coupon ID per company (no two promos share an ID in same tenant)
    pg
      .uniqueIndex('uq_promotions_coupon_id_company')
      .on(table.company_id, table.coupon_id)
      .where(sql`coupon_id IS NOT NULL`),
    // Priority sort for stacking resolution
    pg.index('idx_promotions_priority').on(table.company_id, table.priority),
  ],
);

// ================================================================
// 2. PROMOTION RULES
// Conditions that must ALL be satisfied for the promotion to apply.
// Multiple rows per promotion are ANDed together.
// ================================================================

export const promotion_rules = pg.pgTable(
  'promotion_rules',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    promotion_id: pg
      .uuid('promotion_id')
      .notNull()
      .references(() => promotions.id, { onDelete: 'cascade' }),

    rule_type: promotionRuleTypeEnum('rule_type').notNull(),

    // JSON payload interpreted by the rule engine based on rule_type:
    //
    // min_cart_value:     { amount: 500 }
    //   → cart subtotal must be >= ₹500
    //
    // min_qty:            { qty: 3 }
    //   → total units in cart must be >= 3
    //
    // customer_segment:   { segment_id: "uuid" }
    //   → user must be a member of this segment
    //
    // first_order_only:   {}
    //   → user's completed_orders count must be 0
    //
    // product_in_cart:    { product_id: "uuid" }
    //   → this product must exist in cart (triggers bundle/cross-sell promos)
    //
    // new_customer:       { registered_within_days: 30 }
    //   → user created_at within last N days
    //
    // date_range:         { days_of_week: [0,6] }
    //   → 0=Sun, 6=Sat; only active on weekends
    //
    // max_uses_per_user:  { max: 2 }
    //   → overrides promotion.max_uses_per_user for this rule group
    rule_config: pg.jsonb('rule_config').notNull(),

    // When true, this rule must NOT match (exclusion condition)
    // e.g. "do NOT apply if customer is in VIP segment" (combine with customer_segment)
    negate: pg.boolean('negate').notNull().default(false),

    created_at: pg.timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [pg.index('idx_promo_rules_promotion_id').on(table.promotion_id)],
);

// ================================================================
// 3. PROMOTION TARGETS
// Scopes which products / categories / vendors receive the discount.
// Multiple target rows per promotion are OR'd (any match qualifies).
// Exclusion rows override inclusions.
// ================================================================

export const promotion_targets = pg.pgTable(
  'promotion_targets',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    promotion_id: pg
      .uuid('promotion_id')
      .notNull()
      .references(() => promotions.id, { onDelete: 'cascade' }),

    target_type: promotionTargetTypeEnum('target_type').notNull(),

    // Points to the entity identified by target_type:
    //   all_products     → null (no specific entity)
    //   category         → categories.id
    //   product          → products.id
    //   vendor           → vendor.id
    //   product_variant  → product_variants.id
    target_id: pg.uuid('target_id'),

    // When true: this target is an EXCLUSION.
    // Example: target all "Electronics" (include) but exclude "Laptops" (exclude).
    // Exclusions are evaluated after inclusions.
    exclude: pg.boolean('exclude').notNull().default(false),

    created_at: pg.timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    pg.index('idx_promo_targets_promotion_id').on(table.promotion_id),
    pg
      .index('idx_promo_targets_target_type_id')
      .on(table.target_type, table.target_id),
    // Uniqueness: no duplicate include/exclude rows for same target
    pg
      .uniqueIndex('uq_promo_target')
      .on(table.promotion_id, table.target_type, table.target_id, table.exclude)
      .where(sql`target_id IS NOT NULL`),
  ],
);

// ================================================================
// 4. PROMOTION USAGE LOG
// Records every successful redemption (one row per order per promo).
// Source of truth for per-user and per-promo usage counts.
// Replaces / extends existing coupon_usage for promotion-level tracking.
// ================================================================

export const promotion_usage = pg.pgTable(
  'promotion_usage',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    promotion_id: pg
      .uuid('promotion_id')
      .notNull()
      .references(() => promotions.id, { onDelete: 'restrict' }),
    // restrict: never lose usage history even if promotion is soft-deleted
    order_id: pg
      .uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    user_id: pg
      .uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    company_id: pg
      .uuid('company_id')
      .notNull()
      .references(() => company.id, { onDelete: 'cascade' }),

    // Coupon code entered by customer (if coupon-based; null for auto-applied)
    coupon_code_used: pg.text('coupon_code_used'),

    // Actual discount amount applied (post-cap, post-stacking resolution)
    discount_amount: pg
      .decimal('discount_amount', { precision: 10, scale: 2 })
      .notNull(),

    // Snapshot of the promotion config at redemption time.
    // Ensures reporting is accurate even after the promotion is edited.
    promotion_snapshot: pg.jsonb('promotion_snapshot').notNull(),
    // {
    //   promotion_id, name, promotion_type, discount_config,
    //   priority, is_exclusive, valid_from, valid_to
    // }

    created_at: pg.timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    // Per-user per-promo usage count (checked before applying)
    pg
      .index('idx_promo_usage_user_promo')
      .on(table.user_id, table.promotion_id),
    // Per-promo redemption list (for analytics)
    pg.index('idx_promo_usage_promotion_id').on(table.promotion_id),
    // Per-order promotions applied (for refund recalculation)
    pg.index('idx_promo_usage_order_id').on(table.order_id),
    // One promo per order (a promotion cannot be applied twice to the same order)
    pg
      .uniqueIndex('uq_promo_usage_order_promo')
      .on(table.order_id, table.promotion_id),
  ],
);

// ================================================================
// 5. PROMOTION CHANGELOG
// Immutable audit trail for every status change and config edit.
// Write-once: never UPDATE or DELETE rows in this table.
// Powers the admin approval history and vendor activity feed.
// ================================================================

export const promotion_changelog = pg.pgTable(
  'promotion_changelog',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    promotion_id: pg
      .uuid('promotion_id')
      .notNull()
      .references(() => promotions.id, { onDelete: 'cascade' }),

    // User who triggered the change (admin, vendor, or system for cron expiry)
    changed_by: pg
      .uuid('changed_by')
      .references(() => user.id, { onDelete: 'set null' }),
    // null when changed_by = system (e.g. auto-expiry cron)
    changed_by_system: pg.boolean('changed_by_system').notNull().default(false),

    action: changelogActionEnum('action').notNull(),

    // Before/after diff as JSON — only changed fields are included:
    // { before: { status: "PENDING_REVIEW" }, after: { status: "ACTIVE", approved_by: "uuid" } }
    diff: pg.jsonb('diff'),

    // Free-text note from admin when approving/rejecting
    note: pg.text('note'),

    // Immutable timestamp — defaultNow only, never $onUpdate
    created_at: pg.timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    pg.index('idx_promo_changelog_promotion_id').on(table.promotion_id),
    pg.index('idx_promo_changelog_changed_by').on(table.changed_by),
    pg.index('idx_promo_changelog_created_at').on(table.created_at),
  ],
);

// ================================================================
// 6. CUSTOMER SEGMENTS
// Logical groupings of customers used for promotion targeting.
// Membership is recalculated nightly by a background job.
// A promotion_rule of type customer_segment references segment.id.
// ================================================================

export const customer_segments = pg.pgTable(
  'customer_segments',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    company_id: pg
      .uuid('company_id')
      .notNull()
      .references(() => company.id, { onDelete: 'cascade' }),

    name: pg.text('name').notNull(),
    // e.g. "VIP Customers", "New Signups", "High-Value Buyers"

    description: pg.text('description'),

    // Criteria evaluated to determine membership.
    // The criteria_operator determines AND vs OR logic between top-level rules.
    // criteria is a JSON array of condition objects:
    // [
    //   { "field": "total_orders", "operator": "gte", "value": 5 },
    //   { "field": "total_spent",  "operator": "gte", "value": 5000 },
    //   { "field": "registered_days_ago", "operator": "lte", "value": 30 }
    // ]
    // Supported fields: total_orders, total_spent, registered_days_ago,
    //   last_order_days_ago, average_order_value, has_tag
    criteria: pg.jsonb('criteria').notNull().default('[]'),
    criteria_operator: segmentCriteriaOperatorEnum('criteria_operator')
      .notNull()
      .default(SegmentCriteriaOperator.AND),

    is_active: pg.boolean('is_active').notNull().default(true),

    // Timestamp of last membership recalculation (set by background job)
    last_recalculated_at: pg.timestamp('last_recalculated_at', {
      withTimezone: true,
    }),
    // Total member count after last recalculation
    member_count: pg.integer('member_count').default(0),

    created_at: pg.timestamp('created_at').notNull().defaultNow(),
    updated_at: pg
      .timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    pg.index('idx_segments_company_id').on(table.company_id),
    pg.uniqueIndex('uq_segment_name_company').on(table.company_id, table.name),
  ],
);

// ================================================================
// 7. SEGMENT MEMBERS
// Join table: which users belong to which customer segment.
// Populated and refreshed by the nightly segment recalculation job.
// For real-time segment checks during checkout, query this table
// with the user_id (fast via idx_segment_members_user_id).
// ================================================================

export const segment_members = pg.pgTable(
  'segment_members',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    segment_id: pg
      .uuid('segment_id')
      .notNull()
      .references(() => customer_segments.id, { onDelete: 'cascade' }),
    user_id: pg
      .uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    // Timestamp when this user was added to the segment
    // (changes on each recalculation if user re-qualifies)
    joined_at: pg
      .timestamp('joined_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Primary checkout query: "is this user in segment X?"
    pg.uniqueIndex('uq_segment_member').on(table.segment_id, table.user_id),
    // "What segments is this user in?" — used in promotion rule evaluation
    pg.index('idx_segment_members_user_id').on(table.user_id),
    pg.index('idx_segment_members_segment_id').on(table.segment_id),
  ],
);

// ================================================================
// 8. MARKETING BANNERS
// Storefront display content for promotions and campaigns.
// Decoupled from promotions: a banner can exist without a promotion
// (brand campaigns, seasonal messaging) and a promotion can exist
// without a banner (coupon-only, backend promotions).
// ================================================================

export const marketing_banners = pg.pgTable(
  'marketing_banners',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    company_id: pg
      .uuid('company_id')
      .notNull()
      .references(() => company.id, { onDelete: 'cascade' }),

    // Optional: link banner to a specific promotion for auto-hide when promo expires
    promotion_id: pg
      .uuid('promotion_id')
      .references(() => promotions.id, { onDelete: 'set null' }),

    // Created by (admin user who uploaded the banner)
    created_by: pg
      .uuid('created_by')
      .references(() => user.id, { onDelete: 'set null' }),

    // ── Placement ──
    placement: bannerPlacementEnum('placement').notNull(),

    // ── Content ──
    // S3/CDN URL of banner image (desktop)
    image_url: pg.text('image_url').notNull(),
    // Mobile-optimised variant (optional; falls back to image_url)
    image_url_mobile: pg.text('image_url_mobile'),
    // Alt text for accessibility
    image_alt_text: pg.text('image_alt_text'),

    headline: pg.text('headline'),
    // Main text overlay — e.g. "Up to 50% off Electronics"

    sub_headline: pg.text('sub_headline'),
    // Supporting line — e.g. "Limited time. Ends Sunday."

    cta_label: pg.text('cta_label'),
    // Button text — e.g. "Shop Now", "Claim Offer"

    cta_url: pg.text('cta_url'),
    // Deep link or relative path — e.g. "/shopping?category=electronics&sale=1"

    // ── Scheduling ──
    // Auto-shown / auto-hidden. If promotion_id is set, also hides when promo expires.
    valid_from: pg.timestamp('valid_from', { withTimezone: true }),
    valid_to: pg.timestamp('valid_to', { withTimezone: true }),

    // ── Display order ──
    // Lower = shown first within a placement slot (homepage hero carousel index)
    display_order: pg.integer('display_order').notNull().default(0),

    is_active: pg.boolean('is_active').notNull().default(true),

    created_at: pg.timestamp('created_at').notNull().defaultNow(),
    updated_at: pg
      .timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Storefront query: "give me all active banners for placement X"
    pg
      .index('idx_banners_company_placement_active')
      .on(table.company_id, table.placement, table.is_active),
    // For auto-hide by schedule (queried by banner-expiry cron)
    pg.index('idx_banners_valid_to').on(table.valid_to),
    pg.index('idx_banners_promotion_id').on(table.promotion_id),
  ],
);

// ================================================================
// 9. PROMOTION ANALYTICS EVENTS
// Append-only event log for tracking the promotion funnel:
// viewed → clicked → applied → redeemed
// Used to calculate conversion rates, ROI, and A/B test results.
// Keep this table on a separate analytics DB / partition in production.
// ================================================================

export const promotion_analytics_events = pg.pgTable(
  'promotion_analytics_events',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    promotion_id: pg
      .uuid('promotion_id')
      .notNull()
      .references(() => promotions.id),
    company_id: pg
      .uuid('company_id')
      .notNull()
      .references(() => company.id, { onDelete: 'cascade' }),

    // null for anonymous visitors (viewed/clicked before login)
    user_id: pg
      .uuid('user_id')
      .references(() => user.id, { onDelete: 'set null' }),

    // Set for applied/redeemed events
    order_id: pg
      .uuid('order_id')
      .references(() => orders.id, { onDelete: 'set null' }),

    event_type: promoEventTypeEnum('event_type').notNull(),

    // Source context: where did the event happen?
    // e.g. "homepage_hero", "cart_sidebar", "product_page", "direct_coupon_entry"
    source: pg.text('source'),

    // For redeemed events: actual discount amount applied (for ROI calculation)
    discount_amount: pg.decimal('discount_amount', { precision: 10, scale: 2 }),

    // Device and session context (optional, for attribution analysis)
    // e.g. { "device": "mobile", "session_id": "abc", "ip_country": "IN" }
    context: pg.jsonb('context'),

    // Immutable — never $onUpdate
    created_at: pg.timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    // Analytics queries: all events for a promotion over a time range
    pg
      .index('idx_promo_events_promotion_time')
      .on(table.promotion_id, table.created_at),
    // Funnel query per company
    pg
      .index('idx_promo_events_company_time')
      .on(table.company_id, table.event_type, table.created_at),
    // User journey: "show all promo events for user X"
    pg.index('idx_promo_events_user_id').on(table.user_id),
  ],
);

// ================================================================
// 10. ORDER ITEM PROMOTION SNAPSHOT
// Per-order-item record of which promotions were applied and how
// much discount each item received. Separate from promotion_usage
// (which is per-order per-promo); this is per-item per-promo.
// Used for:
//   - Accurate partial refund calculation (return one item → recompute)
//   - Invoice line-item discount breakdown
//   - Vendor payout deduction reporting
// ================================================================

export const order_item_promotion_snapshot = pg.pgTable(
  'order_item_promotion_snapshot',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    order_item_id: pg
      .uuid('order_item_id')
      .notNull()
      .references(() => order_items.id, { onDelete: 'cascade' }),
    promotion_id: pg
      .uuid('promotion_id')
      .notNull()
      .references(() => promotions.id, { onDelete: 'restrict' }),
    order_id: pg
      .uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    // Original unit price before this promotion
    original_unit_price: pg
      .decimal('original_unit_price', { precision: 10, scale: 2 })
      .notNull(),

    // Discount per unit applied by this promotion
    unit_discount: pg
      .decimal('unit_discount', { precision: 10, scale: 2 })
      .notNull(),

    // Final unit price after this promotion (original - unit_discount)
    final_unit_price: pg
      .decimal('final_unit_price', { precision: 10, scale: 2 })
      .notNull(),

    // Quantity of this item that this discount applied to
    // (for Buy X Get Y: only the "get" items have discount; "buy" items don't)
    discounted_qty: pg.integer('discounted_qty').notNull(),

    // Full snapshot of the promotion at time of purchase (immutable)
    promotion_snapshot: pg.jsonb('promotion_snapshot').notNull(),
    // {
    //   promotion_id, name, promotion_type, discount_config,
    //   coupon_code, priority, valid_from, valid_to
    // }

    created_at: pg.timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    pg.index('idx_oip_snapshot_order_item').on(table.order_item_id),
    pg.index('idx_oip_snapshot_promotion_id').on(table.promotion_id),
    pg.index('idx_oip_snapshot_order_id').on(table.order_id),
    // One promo can apply to one order_item only once
    pg
      .uniqueIndex('uq_oip_snapshot_item_promo')
      .on(table.order_item_id, table.promotion_id),
  ],
);

// ================================================================
// RELATIONS
// ================================================================

export const promotionsRelations = relations(promotions, ({ one, many }) => ({
  company: one(company, {
    fields: [promotions.company_id],
    references: [company.id],
  }),
  createdByUser: one(user, {
    fields: [promotions.created_by],
    references: [user.id],
    relationName: 'promotionsCreatedBy',
  }),
  approvedByUser: one(user, {
    fields: [promotions.approved_by],
    references: [user.id],
    relationName: 'promotionsApprovedBy',
  }),
  coupon: one(coupons, {
    fields: [promotions.coupon_id],
    references: [coupons.id],
  }),
  rules: many(promotion_rules),
  targets: many(promotion_targets),
  usage: many(promotion_usage),
  changelog: many(promotion_changelog),
  analytics_events: many(promotion_analytics_events),
  banners: many(marketing_banners),
  order_item_snapshots: many(order_item_promotion_snapshot),
}));
export const promotion_stackable = pg.pgTable(
  'promotion_stackable',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    promotion_id: pg
      .uuid('promotion_id')
      .notNull()
      .references(() => promotions.id, { onDelete: 'cascade' }),
    stackablePromotion_id: pg
      .uuid('stackable_promotion_id')
      .notNull()
      .references(() => promotions.id, { onDelete: 'cascade' }),
    created_at: pg.timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    pg
      .uniqueIndex('uq_promotion_stackable')
      .on(table.promotion_id, table.stackablePromotion_id),
    pg.index('idx_promotion_stackable_a').on(table.promotion_id),
    pg.index('idx_promotion_stackable_b').on(table.stackablePromotion_id),
  ],
);
export const promotionStackableRelations = relations(
  promotion_stackable,
  ({ one }) => ({
    promotion: one(promotions, {
      fields: [promotion_stackable.promotion_id],
      references: [promotions.id],
    }),
    stackablePromotion: one(promotions, {
      fields: [promotion_stackable.stackablePromotion_id],
      references: [promotions.id],
    }),
  }),
);
export const promotionRulesRelations = relations(
  promotion_rules,
  ({ one }) => ({
    promotion: one(promotions, {
      fields: [promotion_rules.promotion_id],
      references: [promotions.id],
    }),
  }),
);

export const promotionTargetsRelations = relations(
  promotion_targets,
  ({ one }) => ({
    promotion: one(promotions, {
      fields: [promotion_targets.promotion_id],
      references: [promotions.id],
    }),
  }),
);

export const promotionUsageRelations = relations(
  promotion_usage,
  ({ one }) => ({
    promotion: one(promotions, {
      fields: [promotion_usage.promotion_id],
      references: [promotions.id],
    }),
    order: one(orders, {
      fields: [promotion_usage.order_id],
      references: [orders.id],
    }),
    user: one(user, {
      fields: [promotion_usage.user_id],
      references: [user.id],
    }),
    company: one(company, {
      fields: [promotion_usage.company_id],
      references: [company.id],
    }),
  }),
);

export const promotionChangelogRelations = relations(
  promotion_changelog,
  ({ one }) => ({
    promotion: one(promotions, {
      fields: [promotion_changelog.promotion_id],
      references: [promotions.id],
    }),
    changedByUser: one(user, {
      fields: [promotion_changelog.changed_by],
      references: [user.id],
    }),
  }),
);

export const customerSegmentsRelations = relations(
  customer_segments,
  ({ one, many }) => ({
    company: one(company, {
      fields: [customer_segments.company_id],
      references: [company.id],
    }),
    members: many(segment_members),
  }),
);

export const segmentMembersRelations = relations(
  segment_members,
  ({ one }) => ({
    segment: one(customer_segments, {
      fields: [segment_members.segment_id],
      references: [customer_segments.id],
    }),
    user: one(user, {
      fields: [segment_members.user_id],
      references: [user.id],
    }),
  }),
);

export const marketingBannersRelations = relations(
  marketing_banners,
  ({ one }) => ({
    company: one(company, {
      fields: [marketing_banners.company_id],
      references: [company.id],
    }),
    promotion: one(promotions, {
      fields: [marketing_banners.promotion_id],
      references: [promotions.id],
    }),
    createdByUser: one(user, {
      fields: [marketing_banners.created_by],
      references: [user.id],
    }),
  }),
);

export const promotionAnalyticsEventsRelations = relations(
  promotion_analytics_events,
  ({ one }) => ({
    promotion: one(promotions, {
      fields: [promotion_analytics_events.promotion_id],
      references: [promotions.id],
    }),
    company: one(company, {
      fields: [promotion_analytics_events.company_id],
      references: [company.id],
    }),
    user: one(user, {
      fields: [promotion_analytics_events.user_id],
      references: [user.id],
    }),
    order: one(orders, {
      fields: [promotion_analytics_events.order_id],
      references: [orders.id],
    }),
  }),
);

export const orderItemPromotionSnapshotRelations = relations(
  order_item_promotion_snapshot,
  ({ one }) => ({
    order_item: one(order_items, {
      fields: [order_item_promotion_snapshot.order_item_id],
      references: [order_items.id],
    }),
    promotion: one(promotions, {
      fields: [order_item_promotion_snapshot.promotion_id],
      references: [promotions.id],
    }),
    order: one(orders, {
      fields: [order_item_promotion_snapshot.order_id],
      references: [orders.id],
    }),
  }),
);
