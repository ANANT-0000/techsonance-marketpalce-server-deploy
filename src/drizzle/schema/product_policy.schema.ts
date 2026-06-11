// ─── product_policy.schema.ts ───────────────────────────────────

import * as pg from 'drizzle-orm/pg-core';
import { company } from './main.schema';
import { EntityStatusEnum } from './enums.schema';
import { EntityStatus } from '../types/types';
import { categories, order_items, products } from './shop.schema';
import { templates } from './utils.schema';
import { relations } from 'drizzle-orm';

// Policy type enum — covers all real-world cases
export const policyTypeEnum = pg.pgEnum('policy_type_enum', [
  'warranty', // defect coverage for duration
  'guarantee', // performance promise, money-back
  'exchange_only', // no refund, swap allowed
  'no_return', // final sale — innerwear, perishables
  'extended_support', // software/SaaS support contract
  'none', // explicitly no policy (consumables, gift cards)
]);

export const policy_duration_unit_enum = pg.pgEnum(
  'policy_duration_unit_enum',
  ['days', 'months', 'years', 'lifetime'],
);

// ─── 1. POLICY DEFINITIONS ─────────────────────────────────────
// A company/vendor defines their reusable policies once.
// e.g. "1 Year Manufacturer Warranty", "30-Day Exchange", "No Return - Innerwear"
// Then assigns them to categories or specific products.

//===============================================================
export const product_policies = pg.pgTable(
  'product_policies',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    policy_name: pg.text('policy_name').notNull(),
    // e.g. "1 Year Manufacturer Warranty", "6 Month Guarantee", "No Return Policy"
    policy_type: policyTypeEnum('policy_type').notNull(),
    // Duration — only relevant for WARRANTY, GUARANTEE, EXTENDED_SUPPORT
    duration_value: pg.integer('duration_value'), // e.g. 1, 6, 30
    duration_unit: policy_duration_unit_enum('duration_unit'), // YEARS, MONTHS, DAYS, LIFETIME
    // What is covered — printed on the policy document / warranty card
    coverage_description: pg.text('coverage_description'),
    // e.g. "Covers manufacturing defects. Does not cover physical damage or water damage."
    // What is NOT covered — explicit exclusions printed on document
    exclusions: pg.text('exclusions'),
    // Who services the claim — vendor themselves or manufacturer
    service_provider: pg.text('service_provider'),
    // e.g. "Vendor", "Brand Service Center", "Authorized Partner"
    // Contact for claims
    claim_contact_email: pg.text('claim_contact_email'),
    claim_contact_phone: pg.text('claim_contact_phone'),
    claim_process_description: pg.text('claim_process_description'),
    // Whether this policy generates a physical/PDF document on order
    generates_document: pg
      .boolean('generates_document')
      .notNull()
      .default(false),
    // WARRANTY → true (prints warranty card)
    // NO_RETURN → false (just a label on invoice)
    //=============================================================
    document_id: pg
      .uuid('document_id')
      .references(() => templates.id, { onDelete: 'cascade' }),
    is_active: pg.boolean('is_active').notNull().default(true),
    // Owner — policy belongs to either a company or a vendor
    // Both nullable — application logic enforces at least one is set
    company_id: pg
      .uuid('company_id')
      .references(() => company.id, { onDelete: 'cascade' }),
    created_at: pg.timestamp('created_at').notNull().defaultNow(),
    updated_at: pg
      .timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    status: EntityStatusEnum('status').default(EntityStatus.ACTIVE),
    deleted_at: pg.timestamp('deleted_at'),
  },
  (table) => [
    pg.index('idx_policy_company_id').on(table.company_id),
    pg.index('idx_policy_type').on(table.policy_type),
  ],
);

// ─── 2. POLICY → CATEGORY ASSIGNMENT ──────────────────────────
// "All products in Electronics get 1 Year Warranty"
// "All products in Clothing get Exchange Only"
// "All products in Innerwear get No Return"
// This is the DEFAULT policy for any product in that category.
export const category_policy = pg.pgTable(
  'category_policy',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    category_id: pg
      .uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    policy_id: pg
      .uuid('policy_id')
      .notNull()
      .references(() => product_policies.id, { onDelete: 'cascade' }),
    // Priority — if a category has multiple policies (e.g. warranty + no-return on accessories)
    // lower number = higher priority when resolving which policy applies
    priority: pg.integer('priority').notNull().default(1),
    created_at: pg.timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    // One policy type per category (can't have two WARRANTY policies on same category)
    // pg.uniqueIndex('uq_category_policy').on(table.category_id, table.policy_id),
    pg.index('idx_category_policy_category').on(table.category_id),
  ],
);

// ─── 3. POLICY → PRODUCT OVERRIDE ──────────────────────────────
// Product-level override. Beats the category default.
// e.g. Category = Electronics (1 Year Warranty)
//      but this specific product = "Refurbished Laptop" (3 Month Warranty only)
// Or:  Category = Clothing (Exchange Only)
//      but this product = "Custom Embroidered Kurta" (No Return — final sale)
export const product_policy_override = pg.pgTable(
  'product_policy_override',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    product_id: pg
      .uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    policy_id: pg
      .uuid('policy_id')
      .notNull()
      .references(() => product_policies.id, { onDelete: 'cascade' }),
    // Explicitly marks this as overriding the category default
    overrides_category: pg
      .boolean('overrides_category')
      .notNull()
      .default(true),
    created_at: pg.timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    // pg.uniqueIndex('uq_product_policy').on(table.product_id, table.policy_id),
    pg.index('idx_product_policy_override_product').on(table.product_id),
  ],
);

// ─── 4. ORDER ITEM POLICY SNAPSHOT ────────────────────────────
// When an order is placed, snapshot the resolved policy for that item.
// Critical: policy terms must NOT change retroactively after purchase.
// This is what the warranty card / policy document is generated FROM.
export const order_item_policy = pg.pgTable(
  'order_item_policy',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    order_item_id: pg
      .uuid('order_item_id')
      .notNull()
      .references(() => order_items.id, { onDelete: 'cascade' }),
    policy_id: pg
      .uuid('policy_id')
      .notNull()
      .references(() => product_policies.id),
    // Snapshot of policy at time of purchase — immutable after creation
    policy_snapshot: pg.jsonb('policy_snapshot').notNull(),
    // Stores the full resolved policy as JSON so future edits don't affect this order:
    // {
    //   policy_name: "1 Year Manufacturer Warranty",
    //   policy_type: "WARRANTY",
    //   duration_value: 1,
    //   duration_unit: "YEARS",
    //   coverage_description: "...",
    //   exclusions: "...",
    //   service_provider: "Brand Service Center",
    //   claim_contact_email: "support@brand.com"
    // }

    // Computed validity window — stored for quick querying
    policy_start_date: pg.date('policy_start_date').notNull(), // = order delivery date
    policy_end_date: pg.date('policy_end_date'), // null for LIFETIME or NO_RETURN

    // Has the warranty card PDF been generated and stored?
    document_generated: pg.boolean('document_generated').default(false),
    document_url: pg.text('document_url'), // S3/CDN URL of the generated PDF

    created_at: pg.timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    pg.index('idx_oip_order_item').on(table.order_item_id),
    pg.index('idx_oip_policy_end_date').on(table.policy_end_date), // for expiry queries
  ],
);
export const productPoliciesRelations = relations(
  product_policies,
  ({ one, many }) => ({
    company: one(company, {
      fields: [product_policies.company_id],
      references: [company.id],
    }),
    document: one(templates, {
      fields: [product_policies.document_id],
      references: [templates.id],
    }),
    categoryAssignments: many(category_policy),
    productOverrides: many(product_policy_override),
    orderItemPolicies: many(order_item_policy),
  }),
);

export const categoryPolicyRelations = relations(
  category_policy,
  ({ one }) => ({
    category: one(categories, {
      fields: [category_policy.category_id],
      references: [categories.id],
    }),
    policy: one(product_policies, {
      fields: [category_policy.policy_id],
      references: [product_policies.id],
    }),
  }),
);

export const productPolicyOverride = relations(
  product_policy_override,
  ({ one }) => ({
    product: one(products, {
      fields: [product_policy_override.product_id],
      references: [products.id],
    }),
    policy: one(product_policies, {
      fields: [product_policy_override.policy_id],
      references: [product_policies.id],
    }),
  }),
);

export const orderItemPolicy = relations(order_item_policy, ({ one }) => ({
  orderItem: one(order_items, {
    fields: [order_item_policy.order_item_id],
    references: [order_items.id],
  }),
  policy: one(product_policies, {
    fields: [order_item_policy.policy_id],
    references: [product_policies.id],
  }),
}));
