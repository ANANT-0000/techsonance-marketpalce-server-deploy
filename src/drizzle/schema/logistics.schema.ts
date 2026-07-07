import * as pg from 'drizzle-orm/pg-core';

import { vendor } from './users.schema.js';
import { company } from './main.schema.js';
import { ShippingStrategy } from '../types/types.js';
import { ShippingStrategyEnum } from './enums.schema.js';

export const vendor_shipping_preferences = pg.pgTable(
  'vendor_shipping_preferences',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    vendor_id: pg
      .uuid('vendor_id')
      .notNull()
      .references(() => vendor.id, { onDelete: 'restrict' })
      .unique(),
    company_id: pg
      .uuid('company_id')
      .notNull()
      .references(() => company.id, { onDelete: 'restrict' }),

    priority_list: pg
      .jsonb('priority_list')
      .$type<number[]>()
      .notNull()
      .default([]),
    primary_strategy: ShippingStrategyEnum('primary_strategy')
      .notNull()
      .default(ShippingStrategy.PRIORITY),
    fallback_strategy: ShippingStrategyEnum('fallback_strategy')
      .notNull()
      .default(ShippingStrategy.LOWEST_COST),
    exclusion_rules: pg
      .jsonb('exclusion_rules')
      .$type<{
        blocked_courier_ids?: number[];
        max_cost_threshold?: number;
        never_use_couriers?: string[];
      }>()
      .notNull()
      .default({}),

    created_at: pg.timestamp('created_at').notNull().defaultNow(),
    updated_at: pg
      .timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deleted_at: pg.timestamp('deleted_at'),
  },
  (table) => [
    pg.index('idx_vendor_shipping_pref_vendor_id').on(table.vendor_id),
    pg.index('idx_vendor_shipping_pref_company_id').on(table.company_id),
  ],
);

export const logistic_companies = pg.pgTable('logistic_companies', {
  courier_company_id: pg.integer('courier_company_id').primaryKey(),
  courier_name: pg.varchar('courier_name', { length: 255 }).notNull(),
  is_cod_supported: pg.boolean('is_cod_supported').default(false),
  is_surface: pg.boolean('is_surface').default(false),
  delivery_score: pg.real('delivery_score').default(0),
  pickup_score: pg.real('pickup_score').default(0),
  rating: pg.real('rating').default(0),
  // Weight constraints useful for reference
  min_weight: pg.real('min_weight'),
  charge_weight: pg.real('charge_weight'),
  volumetric_max_weight: pg.real('volumetric_max_weight'),

  last_seen: pg.timestamp('last_seen').defaultNow().notNull(),
});
