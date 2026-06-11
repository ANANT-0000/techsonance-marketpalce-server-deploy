import * as pg from 'drizzle-orm/pg-core';
import { company } from './main.schema';
import { address, user, vendor } from './users.schema';
import { product_variants, orders } from './shop.schema';
import {
  EntityStatus,
  SupportTicketPriority,
  SupportTicketStatus,
} from '../types/types';
import { EntityStatusEnum } from './enums.schema';
export const support_tickets_status_enum = pg.pgEnum(
  'support_tickets_status_enum',
  SupportTicketStatus,
);
export const support_tickets_priority_enum = pg.pgEnum(
  'support_tickets_priority_enum',
  SupportTicketPriority,
);

export const company_document = pg.pgTable('company_document', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  document_type: pg.text('document_type').notNull(),
  document_url: pg.text('document_url').notNull(),
  document_status: pg.text('document_status'),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  vendor_id: pg
    .uuid('vendor_id')
    .references(() => vendor.id, { onDelete: 'cascade' }),
  company_id: pg
    .uuid('company_id')
    .references(() => company.id, { onDelete: 'cascade' }),
});

export const warehouse = pg.pgTable('warehouse', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  warehouse_name: pg.text('warehouse_name').notNull(),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  address_id: pg
    .uuid('address_id')
    .references(() => address.id, { onDelete: 'cascade' })
    .notNull(),
  status: EntityStatusEnum('status').default(EntityStatus.ACTIVE),
  deleted_at: pg.timestamp('deleted_at'),
  company_id: pg
    .uuid('company_id')
    .references(() => company.id, { onDelete: 'cascade' })
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
    restocked_at: pg
      .timestamp('restocked_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    product_variant_id: pg
      .uuid('product_variant_id')
      .references(() => product_variants.id, { onDelete: 'cascade' })
      .notNull(),
    warehouse_id: pg
      .uuid('warehouse_id')
      .references(() => warehouse.id, { onDelete: 'cascade' })
      .notNull(),
    company_id: pg
      .uuid('company_id')
      .references(() => company.id, { onDelete: 'cascade' }),
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
  category: pg.text('category'),
  attachment_url: pg.text('attachment_url'),
  order_id: pg
    .uuid('order_id')
    .references(() => orders.id, { onDelete: 'set null' }),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  user_id: pg
    .uuid('user_id')
    .references(() => user.id, { onDelete: 'cascade' }),
  company_id: pg
    .uuid('company_id')
    .references(() => company.id, { onDelete: 'cascade' }),
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
    user_id: pg
      .uuid('user_id')
      .references(() => user.id, { onDelete: 'cascade' }),
    company_id: pg
      .uuid('company_id')
      .references(() => company.id, { onDelete: 'cascade' }),
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

    user_id: pg
      .uuid('user_id')
      .references(() => user.id, { onDelete: 'cascade' }),
    company_id: pg
      .uuid('company_id')
      .references(() => company.id, { onDelete: 'cascade' }),
    admin_id: pg.uuid('admin_id').references(() => user.id),
  },
  (table) => [
    pg.index('idx_audit_logs_user_id').on(table.user_id),
    pg.index('idx_audit_logs_company_id').on(table.company_id),
    pg.index('idx_audit_logs_entity').on(table.entity),
    pg.index('idx_audit_logs_created_at').on(table.created_at),
  ],
);
export const templates = pg.pgTable('templates', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  template_name: pg.text('template_name').notNull(),
  template_label: pg.text('template_label').notNull(),
  template_url: pg.text('template_url'),
  description: pg.text('description'),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  company_id: pg
    .uuid('company_id')
    .references(() => company.id, { onDelete: 'cascade' }),
  vendor_id: pg
    .uuid('vendor_id')
    .references(() => vendor.id, { onDelete: 'cascade' }),
});

export const help_articles = pg.pgTable('help_articles', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  title: pg.text('title').notNull(),
  slug: pg.text('slug').notNull(),
  content: pg.text('content').notNull(),
  category: pg.text('category').notNull(),
  order_index: pg.integer('order_index').default(0),
  is_published: pg.boolean('is_published').default(true).notNull(),
  helpful_count: pg.integer('helpful_count').default(0).notNull(),
  not_helpful_count: pg.integer('not_helpful_count').default(0).notNull(),
  view_count: pg.integer('view_count').default(0).notNull(),
  company_id: pg
    .uuid('company_id')
    .references(() => company.id, { onDelete: 'cascade' }),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const customer_feedback = pg.pgTable('customer_feedback', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  user_id: pg
    .uuid('user_id')
    .references(() => user.id, { onDelete: 'cascade' }),
  order_id: pg
    .uuid('order_id')
    .references(() => orders.id, { onDelete: 'set null' }),
  ticket_id: pg
    .uuid('ticket_id')
    .references(() => support_tickets.id, { onDelete: 'set null' }),
  type: pg.text('type').notNull(), // BUG, SUGGESTION, COMPLAINT, PRAISE
  subject: pg.text('subject'),
  message: pg.text('message').notNull(),
  priority: pg.text('priority').default('MEDIUM').notNull(),
  status: pg.text('status').default('NEW').notNull(),
  company_id: pg
    .uuid('company_id')
    .references(() => company.id, { onDelete: 'cascade' }),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const ticket_comments = pg.pgTable('ticket_comments', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  ticket_id: pg
    .uuid('ticket_id')
    .references(() => support_tickets.id, { onDelete: 'cascade' })
    .notNull(),
  user_id: pg
    .uuid('user_id')
    .references(() => user.id, { onDelete: 'cascade' }),
  comment_text: pg.text('comment_text').notNull(),
  is_internal: pg.boolean('is_internal').default(false).notNull(),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
});

export const notification_settings = pg.pgTable('notification_settings', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  user_id: pg
    .uuid('user_id')
    .references(() => user.id, { onDelete: 'cascade' })
    .unique()
    .notNull(),
  email_tickets: pg.boolean('email_tickets').default(true).notNull(),
  email_orders: pg.boolean('email_orders').default(true).notNull(),
  email_returns: pg.boolean('email_returns').default(true).notNull(),
  email_newsletters: pg.boolean('email_newsletters').default(false).notNull(),
  in_app_notifications: pg
    .boolean('in_app_notifications')
    .default(true)
    .notNull(),
  quiet_hours_start: pg.text('quiet_hours_start'), // Store as HH:MM format
  quiet_hours_end: pg.text('quiet_hours_end'),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const ticket_ratings = pg.pgTable('ticket_ratings', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  ticket_id: pg
    .uuid('ticket_id')
    .references(() => support_tickets.id, { onDelete: 'cascade' })
    .unique()
    .notNull(),
  user_id: pg
    .uuid('user_id')
    .references(() => user.id, { onDelete: 'cascade' })
    .notNull(),
  satisfaction_rating: pg.integer('satisfaction_rating').notNull(), // 1-5
  resolved: pg.boolean('resolved').default(true).notNull(),
  resolution_comment: pg.text('resolution_comment'),
  nps_score: pg.integer('nps_score'), // 0-10
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
});

// ================================================================
