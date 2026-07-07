import * as pg from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { company } from './main.schema.js';
import {
  FeatureType,
  JobStatus,
  PlanStatus,
  PriceInterval,
  SubscriptionStatus,
  SyncStatus,
} from '../types/types.js';
import {
  subscriptionStatusEnum,
  planStatusEnum,
  priceIntervalEnum,
  syncStatusEnum,
  featureTypeEnum,
  jobStatusEnum,
} from './enums.schema.js';
export const subscription_plans = pg.pgTable('subscription_plans', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  plan_name: pg.text('plan_name').notNull().unique(), // 'trial', 'starter', 'pro'
  display_name: pg.text('display_name').notNull(),
  price_monthly: pg
    .decimal('price_monthly', { precision: 10, scale: 2 })
    .default('0'),
  price_annual: pg
    .decimal('price_annual', { precision: 10, scale: 2 })
    .default('0'), // per-month price when billed annually
  annual_total: pg
    .decimal('annual_total', { precision: 10, scale: 2 })
    .default('0'), // total charged upfront for an annual subscription
  trial_days: pg.integer('trial_days').default(14),
  capabilities: pg.jsonb('capabilities').notNull().default('{}'),
  // { max_products: 50, max_orders_per_month: 500, storage_gb: 5,
  //   can_use_promotions: true, can_use_custom_domain: false }
  is_active: pg.boolean('is_active').default(true),
  display_order: pg.integer('display_order').default(0),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  company_id: pg
    .uuid('company_id')
    .references(() => company.id, { onDelete: 'restrict' }),
});

export const vendor_subscriptions = pg.pgTable(
  'vendor_subscriptions',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    company_id: pg
      .uuid('company_id')
      .notNull()
      .unique()
      .references(() => company.id, { onDelete: 'restrict' }),
    plan_id: pg
      .uuid('plan_id')
      .notNull()
      .references(() => subscription_plans.id),
    status: subscriptionStatusEnum('status')
      .notNull()
      .default(SubscriptionStatus.TRIAL),
    trial_starts_at: pg.timestamp('trial_starts_at'),
    trial_ends_at: pg.timestamp('trial_ends_at'),
    current_period_start: pg.timestamp('current_period_start'),
    current_period_end: pg.timestamp('current_period_end'),
    cancelled_at: pg.timestamp('cancelled_at'),
    grace_period_ends_at: pg.timestamp('grace_period_ends_at'), // 3 days after expiry
    created_at: pg.timestamp('created_at').notNull().defaultNow(),
    updated_at: pg
      .timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    pg.index('idx_sub_company_id').on(table.company_id),
    pg.index('idx_sub_status').on(table.status),
    pg.index('idx_sub_trial_ends').on(table.trial_ends_at), // cron queries this
  ],
);

export const subscription_events = pg.pgTable(
  'subscription_events',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    company_id: pg
      .uuid('company_id')
      .notNull()
      .references(() => company.id, { onDelete: 'restrict' }),
    subscription_id: pg
      .uuid('subscription_id')
      .references(() => vendor_subscriptions.id),
    event_type: pg.text('event_type').notNull(),
    // 'trial_started' | 'trial_expired' | 'plan_selected' | 'upgraded' | 'cancelled'
    plan_id: pg.uuid('plan_id').references(() => subscription_plans.id),
    metadata: pg.jsonb('metadata').default('{}'),
    created_at: pg.timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [pg.index('idx_sub_events_company').on(table.company_id)],
);

export const subscriptionPlanRelations = relations(
  subscription_plans,
  ({ many }) => ({
    subscriptions: many(vendor_subscriptions),
  }),
);

export const vendorSubscriptionRelations = relations(
  vendor_subscriptions,
  ({ one }) => ({
    plan: one(subscription_plans, {
      fields: [vendor_subscriptions.plan_id],
      references: [subscription_plans.id],
    }),
    company: one(company, {
      fields: [vendor_subscriptions.company_id],
      references: [company.id],
    }),
  }),
);

export const subscriptionEventRelations = relations(
  subscription_events,
  ({ one }) => ({
    company: one(company, {
      fields: [subscription_events.company_id],
      references: [company.id],
    }),
    subscription: one(vendor_subscriptions, {
      fields: [subscription_events.subscription_id],
      references: [vendor_subscriptions.id],
    }),
  }),
);

// ==========================================
// NEW CMS SUBSCRIPTION PLAN SCHEMAS
// ==========================================

export const cms_plans = pg.pgTable(
  'cms_plans',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    plan_key: pg.text('plan_key').notNull(),
    status: planStatusEnum('status').notNull().default(PlanStatus.DRAFT),
    version: pg.integer('version').notNull().default(1),
    created_by: pg.uuid('created_by'),
    updated_by: pg.uuid('updated_by'),
    created_at: pg.timestamp('created_at').notNull().defaultNow(),
    updated_at: pg
      .timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    pg.uniqueIndex('idx_cms_plan_key_status').on(table.plan_key, table.status),
  ],
);

export const cms_plan_versions = pg.pgTable('cms_plan_versions', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  plan_id: pg
    .uuid('plan_id')
    .notNull()
    .references(() => cms_plans.id, { onDelete: 'cascade' }),
  version_number: pg.integer('version_number').notNull(),
  changed_by: pg.uuid('changed_by'),
  changed_at: pg.timestamp('changed_at').notNull().defaultNow(),
  diff_json: pg.jsonb('diff_json').notNull(),
  change_reason: pg.text('change_reason'),
});

export const cms_plan_prices = pg.pgTable('cms_plan_prices', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  plan_id: pg
    .uuid('plan_id')
    .notNull()
    .references(() => cms_plans.id, { onDelete: 'cascade' }),

  /** ISO 4217 currency code (e.g. `INR`, `USD`, `JPY`). Determines how `amount_minor_units` should be interpreted alongside `currency_exponent`. */
  currency: pg.text('currency').notNull().default('INR'),

  /** Billing cycle unit (e.g. monthly, yearly). Paired with `interval_count` to express things like "every 3 months". */
  interval: priceIntervalEnum('interval')
    .notNull()
    .default(PriceInterval.MONTHLY),

  /** Number of `interval` units per billing cycle (e.g. `3` + `MONTHLY` = quarterly). Nullable — leave unset for gateways/plans that don't need a multiplier. */
  interval_count: pg.integer('interval_count'),

  /**
   * Number of decimal digits `amount_minor_units` must be divided by (10^n) to get the amount in major currency units.
   * Varies by currency — not always 2. Examples: `USD`/`INR` → 2, `JPY`/`KRW` → 0 (zero-decimal), `BHD`/`KWD` → 3.
   * Do NOT assume 2 (i.e. "cents") for all currencies — that assumption breaks zero-decimal and 3-decimal currencies.
   */
  currency_exponent: pg.integer('currency_exponent').notNull().default(2),

  /**
   * Price amount in the smallest unit of `currency` (e.g. paise for INR, cents for USD, whole yen for JPY — no subunit).
   * Always an integer to avoid floating-point rounding errors with money.
   * Convert to major units via `amount_minor_units / 10^currency_exponent`.
   */
  amount_minor_units: pg.integer('amount_minor_units').notNull().default(0),

  /** ID of the corresponding price object in the payment gateway (e.g. Stripe/Razorpay price ID). Null until synced. */
  gateway_price_id: pg.text('gateway_price_id'),

  /** Sync state between this row and the payment gateway (e.g. pending, synced, failed). */
  sync_status: syncStatusEnum('sync_status')
    .notNull()
    .default(SyncStatus.PENDING),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const cms_plan_features = pg.pgTable('cms_plan_features', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  plan_id: pg
    .uuid('plan_id')
    .notNull()
    .references(() => cms_plans.id, { onDelete: 'cascade' }),
  feature_key: pg.text('feature_key').notNull(),
  type: featureTypeEnum('type').notNull().default(FeatureType.BOOLEAN),
  value: pg.text('value').notNull(),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
});

export const cms_sync_jobs = pg.pgTable('cms_sync_jobs', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  plan_id: pg
    .uuid('plan_id')
    .notNull()
    .references(() => cms_plans.id, { onDelete: 'cascade' }),
  idempotency_key: pg.text('idempotency_key').notNull().unique(),
  status: jobStatusEnum('status').notNull().default(JobStatus.PENDING),
  attempts: pg.integer('attempts').notNull().default(0),
  last_error: pg.text('last_error'),
  gateway_response_json: pg.jsonb('gateway_response_json'),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const cmsPlanRelations = relations(cms_plans, ({ many }) => ({
  versions: many(cms_plan_versions),
  prices: many(cms_plan_prices),
  features: many(cms_plan_features),
  syncJobs: many(cms_sync_jobs),
}));

export const cmsPlanVersionRelations = relations(
  cms_plan_versions,
  ({ one }) => ({
    plan: one(cms_plans, {
      fields: [cms_plan_versions.plan_id],
      references: [cms_plans.id],
    }),
  }),
);

export const cmsPlanPriceRelations = relations(cms_plan_prices, ({ one }) => ({
  plan: one(cms_plans, {
    fields: [cms_plan_prices.plan_id],
    references: [cms_plans.id],
  }),
}));

export const cmsPlanFeatureRelations = relations(
  cms_plan_features,
  ({ one }) => ({
    plan: one(cms_plans, {
      fields: [cms_plan_features.plan_id],
      references: [cms_plans.id],
    }),
  }),
);

export const cmsSyncJobRelations = relations(cms_sync_jobs, ({ one }) => ({
  plan: one(cms_plans, {
    fields: [cms_sync_jobs.plan_id],
    references: [cms_plans.id],
  }),
}));
