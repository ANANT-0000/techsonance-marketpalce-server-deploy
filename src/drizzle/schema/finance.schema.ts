import * as pg from 'drizzle-orm/pg-core';
import { company, orders, products } from '.';

export const tax_profiles = pg.pgTable('tax_profiles', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  profile_type: pg.text('profile_type').notNull(),
  tax_profile_description: pg.text('tax_profile_description').notNull(),
  is_default: pg.boolean('is_default').notNull().default(false),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  company_id: pg.uuid('company_id').references(() => company.id),
});
export const tax_types = pg.pgTable('tax_types', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  tax_name: pg.text('tax_name').notNull(),
  tax_code: pg.text('tax_code').notNull(),
  tax_scope: pg.text('tax_scope').notNull(),
  is_default: pg.boolean('is_default').notNull().default(false),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  tax_profile_id: pg
    .uuid('tax_profile_id')
    .references(() => tax_profiles.id, { onDelete: 'cascade' }),
  company_id: pg.uuid('company_id').references(() => company.id),
});
export const gst_registrations = pg.pgTable('gst_registrations', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  gst_number: pg.text('gst_number').notNull(),
  legal_name: pg.text('legal_name').notNull(),
  trade_name: pg.text('trade_name').notNull(),
  state_code: pg.text('state_code').notNull(),
  registration_type: pg.text('registration_type').notNull(),
  registration_date: pg.date('registration_date').notNull(),
  effective_from: pg.date('effective_from').notNull(),
  effective_to: pg.date('effective_to').notNull(),
  is_default: pg.boolean('is_default').notNull().default(false),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  company_id: pg.uuid('company_id').references(() => company.id),
});
export const tax_rates = pg.pgTable('tax_rates', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  tax_rate_name: pg.text('tax_rate_name').notNull(),
  state: pg.text('state').notNull(),
  tax_rate_value: pg
    .decimal('tax_rate_value', { precision: 5, scale: 2 })
    .notNull(),
  is_exempt: pg.boolean('is_exempt').notNull().default(false),
  effective_from: pg.date('effective_from').notNull(),
  effective_to: pg.date('effective_to').notNull(),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  tax_type_id: pg
    .uuid('tax_type_id')
    .references(() => tax_types.id, { onDelete: 'cascade' }),
  company_id: pg.uuid('company_id').references(() => company.id),
});
export const product_tax = pg.pgTable('product_tax', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  product_id: pg
    .uuid('product_id')
    .references(() => products.id, { onDelete: 'cascade' }),
  tax_rate_id: pg
    .uuid('tax_rate_id')
    .references(() => tax_rates.id, { onDelete: 'cascade' }),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
export const orders_tax = pg.pgTable('orders_tax', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  order_id: pg.uuid('order_id').references(() => orders.id),
  tax_types_id: pg.uuid('tax_types_id').references(() => tax_types.id),
});
export const gst_invoices = pg.pgTable('gst_invoices', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  invoice_number: pg.text('invoice_number').notNull(),
  invoice_date: pg.date('invoice_date').notNull(),
  cgst_amount: pg.decimal('cgst_amount', { precision: 10, scale: 2 }).notNull(),
  sgst_amount: pg.decimal('sgst_amount', { precision: 10, scale: 2 }).notNull(),
  igst_amount: pg.decimal('igst_amount', { precision: 10, scale: 2 }).notNull(),
  total_tax: pg.decimal('total_tax', { precision: 10, scale: 2 }).notNull(),
  gst_amount: pg.decimal('gst_amount', { precision: 10, scale: 2 }).notNull(),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  order_id: pg.uuid('order_id').references(() => orders.id),
  gst_registration_id: pg
    .uuid('gst_registration_id')
    .references(() => gst_registrations.id),
  company_id: pg.uuid('company_id').references(() => company.id),
});
