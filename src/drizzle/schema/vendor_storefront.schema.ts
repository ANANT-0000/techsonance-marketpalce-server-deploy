import * as pg from 'drizzle-orm/pg-core';
import { vendor } from './users.schema';

export const vendor_storefront_sections = pg.pgTable(
  'vendor_storefront_sections',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    vendor_id: pg
      .uuid('vendor_id')
      .notNull()
      .references(() => vendor.id, { onDelete: 'cascade' }),
    
    // Section type: 'hero', 'lookbook', 'scarcity', 'social_proof', 'curated'
    section_type: pg.text('section_type').notNull(),
    
    // Status and Ordering
    is_enabled: pg.boolean('is_enabled').notNull().default(true),
    sort_order: pg.integer('sort_order').notNull().default(0),
    
    // Section settings and CMS content stored as JSON
    content: pg.jsonb('content').notNull().default('{}'),
    
    created_at: pg.timestamp('created_at').notNull().defaultNow(),
    updated_at: pg
      .timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    pg.index('idx_vendor_storefront_vendor_id').on(table.vendor_id),
    pg.index('idx_vendor_storefront_is_enabled').on(table.is_enabled),
    pg.index('idx_vendor_storefront_sort_order').on(table.sort_order),
  ],
);
