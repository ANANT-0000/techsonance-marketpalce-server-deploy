import * as pg from 'drizzle-orm/pg-core';
import { company } from './main.schema';
import { EntityStatusEnum } from './enums.schema';
import { orders, products } from './shop.schema';
import { relations, sql } from 'drizzle-orm';
import { EntityStatus } from '../types/types';

export const tax_profiles = pg.pgTable('tax_profiles', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  profile_type: pg.text('profile_type').notNull(),

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

// finance.schema.ts — replace tax_types + tax_rates with tax_slabs

export const tax_slabs = pg.pgTable('tax_slabs', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  slab_name: pg.text('slab_name').notNull(), // "GST 18%", "GST 5%"
  total_rate: pg.decimal('total_rate', { precision: 5, scale: 2 }).notNull(),
  // total_rate is the FULL GST %. Checkout splits it: intra = half/half, inter = all IGST
  description: pg.text('description'), // optional
  is_exempt: pg.boolean('is_exempt').notNull().default(false),
  effective_from: pg.date('effective_from').notNull(),
  effective_to: pg.date('effective_to').notNull().default(sql`'2099-12-31'`),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  tax_profile_id: pg
    .uuid('tax_profile_id')
    .references(() => tax_profiles.id, { onDelete: 'cascade' }),
  tax_type_id: pg
    .uuid('tax_type_id')
    .references(() => tax_types.id, { onDelete: 'cascade' }),
  company_id: pg.uuid('company_id').references(() => company.id),
});

export const product_tax = pg.pgTable('product_tax', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  product_id: pg
    .uuid('product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .unique(),
  tax_slab_id: pg
    .uuid('tax_slab_id') // renamed from tax_rate_id
    .references(() => tax_slabs.id, { onDelete: 'set null' }),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
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
  order_id: pg.uuid('order_id').references(() => orders.id).unique(),
  company_id: pg.uuid('company_id').references(() => company.id),
  status: EntityStatusEnum('status').default(EntityStatus.ACTIVE),
  deleted_at: pg.timestamp('deleted_at'),
});

export const gstInvoicesRelations = relations(gst_invoices, ({ one }) => ({
  order: one(orders, {
    fields: [gst_invoices.order_id],
    references: [orders.id],
  }),
  company: one(company, {
    fields: [gst_invoices.company_id],
    references: [company.id],
  }),
}));
// --- Product Tax Mapping ---
export const productTaxRelations = relations(product_tax, ({ one }) => ({
  product: one(products, {
    fields: [product_tax.product_id],
    references: [products.id],
  }),
  taxSlab: one(tax_slabs, {
    fields: [product_tax.tax_slab_id],
    references: [tax_slabs.id],
  }),
}));
