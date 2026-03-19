import * as pg from 'drizzle-orm/pg-core';
import { address, company, product_variants, user, vendor } from '.';
import { SupportTicketPriority, SupportTicketStatus } from '../types/types';
import { VendorDocumentType } from 'types/vendor.type';

export const support_tickets_status_enum = pg.pgEnum(
  'support_tickets_status_enum',
  SupportTicketStatus,
);
export const support_tickets_priority_enum = pg.pgEnum(
  'support_tickets_priority_enum',
  SupportTicketPriority,
);
const documentTypeEnum = pg.pgEnum(
  'vendor_document_type_enum',
  VendorDocumentType,
);
export const vendor_document = pg.pgTable('vendor_document', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  document_type: documentTypeEnum('document_type').notNull(),
  document_url: pg.text('document_url'),
  document_status: pg.text('document_status'),
  created_at: pg
    .timestamp('created_at')
    .$default(() => new Date())
    .notNull(),
  updated_at: pg
    .timestamp('updated_at')
    .$onUpdate(() => new Date())
    .notNull(),
  vendor_id: pg
    .uuid('vendor_id')
    .references(() => vendor.id, { onDelete: 'cascade' })
    .notNull(),
});
export const warehouse = pg.pgTable('warehouse', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  warehouse_name: pg.text('warehouse_name').notNull(),
  created_at: pg
    .timestamp('created_at')
    .$default(() => new Date())
    .notNull(),
  updated_at: pg
    .timestamp('updated_at')
    .$onUpdate(() => new Date())
    .notNull(),
  address_id: pg
    .uuid('address_id')
    .references(() => address.id)
    .notNull(),
  company_id: pg
    .uuid('company_id')
    .references(() => company.id)
    .notNull(),
});
export const inventory = pg.pgTable(
  'inventory',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    stock_quantity: pg.integer('stock_quantity').notNull(),
    created_at: pg
      .timestamp('created_at')
      .$default(() => new Date())
      .notNull(),
    updated_at: pg
      .timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
    product_variant_id: pg
      .uuid('product_variant_id')
      .references(() => product_variants.id)
      .notNull(),
    warehouse_id: pg
      .uuid('warehouse_id')
      .references(() => warehouse.id, { onDelete: 'cascade' })
      .notNull(),
    company_id: pg.uuid('company_id').references(() => company.id),
  },
  (table) => [
    pg.index('idx_inventory_product_variant_id').on(table.product_variant_id),
    pg.index('idx_inventory_warehouse_id').on(table.warehouse_id),
    pg.index('idx_inventory_company_id').on(table.company_id),
  ],
);
export const support_tickets = pg.pgTable('support_tickets', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  subject: pg.text('subject').notNull(),
  description: pg.text('description').notNull(),
  status: support_tickets_status_enum().notNull(),
  priority: support_tickets_priority_enum().notNull(),
  created_at: pg
    .timestamp('created_at')
    .$default(() => new Date())
    .notNull(),
  updated_at: pg
    .timestamp('updated_at')
    .$onUpdate(() => new Date())
    .notNull(),
  company_id: pg.uuid('company_id').references(() => company.id),
});
export const notifications = pg.pgTable(
  'notifications',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    message: pg.text('message').notNull(),
    channel: pg.text('channel').notNull(),
    is_read: pg.boolean('is_read').notNull().default(false),
    created_at: pg
      .timestamp('created_at')
      .$default(() => new Date())
      .notNull(),
    updated_at: pg
      .timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
    user_id: pg.uuid('user_id').references(() => user.id),
    company_id: pg.uuid('company_id').references(() => company.id),
  },
  (table) => [
    pg.index('idx_notifications_user_id').on(table.user_id),
    pg.index('idx_notifications_company_id').on(table.company_id),
    pg.index('idx_notifications_is_read').on(table.is_read),
  ],
);
export const audit_logs = pg.pgTable(
  'audit_logs',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    action: pg.text('action').notNull(),
    entity: pg.text('entity').notNull(),
    entity_id: pg.uuid('entity_id').notNull(),
    details: pg.jsonb('details').notNull(),
    created_at: pg
      .timestamp('created_at')
      .$default(() => new Date())
      .notNull(),
    updated_at: pg
      .timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
    user_id: pg.uuid('user_id').references(() => user.id),
    company_id: pg.uuid('company_id').references(() => company.id),
  },
  (table) => [
    pg.index('idx_audit_logs_user_id').on(table.user_id),
    pg.index('idx_audit_logs_company_id').on(table.company_id),
    pg.index('idx_audit_logs_entity').on(table.entity),
    pg.index('idx_audit_logs_created_at').on(table.created_at),
  ],
);
