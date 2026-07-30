import * as pg from 'drizzle-orm/pg-core';
import { company } from './main.schema.js';
import { AnyPgColumn } from 'drizzle-orm/pg-core';

export const FilterOwnerTypeEnum = pg.pgEnum('filter_owner_type', ['platform', 'vendor']);

export const product_filters = pg.pgTable('product_filters', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  owner_type: FilterOwnerTypeEnum('owner_type').notNull().default('vendor'),
  owner_id: pg.uuid('owner_id').references(() => company.id, { onDelete: 'cascade' }),
  name: pg.varchar('name', { length: 255 }).notNull(),
  rules: pg.jsonb('rules').notNull().default([]), // Flat-AND array of rules
  copied_from_id: pg.uuid('copied_from_id').references((): AnyPgColumn => product_filters.id, { onDelete: 'set null' }),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
