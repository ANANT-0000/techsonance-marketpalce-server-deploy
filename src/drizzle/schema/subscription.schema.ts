import * as pg from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { company } from './main.schema';
import { SubscriptionStatus } from '../types/types';

export const subscriptionStatusEnum = pg.pgEnum(
  'subscription_status_enum',
  SubscriptionStatus,
);

export const subscription_plans = pg.pgTable('subscription_plans', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  plan_name: pg.text('plan_name').notNull().unique(), // 'trial', 'starter', 'pro'
  display_name: pg.text('display_name').notNull(),
  price_monthly: pg
    .decimal('price_monthly', { precision: 10, scale: 2 })
    .default('0'),
  trial_days: pg.integer('trial_days').default(14),
  capabilities: pg.jsonb('capabilities').notNull().default('{}'),
  // { max_products: 50, max_orders_per_month: 500, storage_gb: 5,
  //   can_use_promotions: true, can_use_custom_domain: false }
  is_active: pg.boolean('is_active').default(true),
  display_order: pg.integer('display_order').default(0),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
});

export const vendor_subscriptions = pg.pgTable(
  'vendor_subscriptions',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    company_id: pg
      .uuid('company_id')
      .notNull()
      .unique()
      .references(() => company.id, { onDelete: 'cascade' }),
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
      .references(() => company.id, { onDelete: 'cascade' }),
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
