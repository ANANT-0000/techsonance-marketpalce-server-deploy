import * as pg from 'drizzle-orm/pg-core';
import { company } from './main.schema.js';

export const landing_pages = pg.pgTable('landing_pages', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  company_id: pg
    .uuid('company_id')
    .notNull()
    .references(() => company.id, { onDelete: 'cascade' })
    .unique(),
  primary_color: pg.varchar('primary_color', { length: 50 }).notNull(),
  secondary_color: pg.varchar('secondary_color', { length: 50 }).notNull(),
  background_color: pg.varchar('background_color', { length: 50 }).notNull(),
  text_color: pg.varchar('text_color', { length: 50 }).notNull(),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const landing_page_content = pg.pgTable('landing_page_content', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  company_id: pg
    .uuid('company_id')
    .notNull()
    .references(() => company.id, { onDelete: 'cascade' })
    .unique(),
  content: pg.jsonb('content'),
  is_published: pg.boolean('is_published').notNull().default(false),
  version: pg.integer('version').notNull().default(1),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
