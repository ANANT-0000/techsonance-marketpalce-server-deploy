import * as pg from 'drizzle-orm/pg-core';
import {
  AccessStatus,
  UserRole,
  UserStatus,
  EntityStatus,
  LogisticsMode,
  ShippingChargeStrategy,
  DomainType,
} from '../types/types.js';
import {
  AccessStatusEnum,
  companyEnum,
  EntityStatusEnum,
  LogisticsModeEnum,
  ShippingChargeStrategyEnum,
  DomainTypeEnum,
} from './enums.schema.js';
import { user } from './users.schema.js';
import { sql } from 'drizzle-orm';

export const company = pg.pgTable(
  'company',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    company_name: pg.text('company_name').notNull(),
    company_domain: pg.text('company_domain').notNull(),
    domain_type: DomainTypeEnum('domain_type').notNull().default(DomainType.SUBDOMAIN),
    company_structure: pg.text('company_structure').notNull(),
    onboarding_status: companyEnum('onboarding_status')
      .notNull()
      .default(EntityStatus.PENDING),
    entity_status: EntityStatusEnum('entity_status')
      .notNull()
      .default(EntityStatus.ACTIVE),

    // Logistics — platform level defaults only
    logistics_mode: LogisticsModeEnum('logistics_mode')
      .notNull()
      .default(LogisticsMode.PLATFORM_PROXY),
    logistics_is_active: pg
      .boolean('logistics_is_active')
      .notNull()
      .default(true),
    encrypted_logistics_api_key: pg.text('encrypted_logistics_api_key'),
    logistics_api_key_iv: pg.text('logistics_api_key_iv'),
    logistics_api_key_tag: pg.text('logistics_api_key_tag'),
    encrypted_logistics_api_secret: pg.text('encrypted_logistics_api_secret'),
    logistics_api_secret_iv: pg.text('logistics_api_secret_iv'),
    logistics_api_secret_tag: pg.text('logistics_api_secret_tag'),
    logistics_pickup_id: pg.varchar('logistics_pickup_id', { length: 100 }),
    encryption_key_version: pg
      .integer('encryption_key_version')
      .notNull()
      .default(1),

    // Shipping
    is_free_shipping_enabled: pg
      .boolean('is_free_shipping_enabled')
      .notNull()
      .default(false),
    free_delivery_threshold: pg.decimal('free_delivery_threshold', {
      precision: 10,
      scale: 2,
    }),
    standard_delivery_charge: pg
      .decimal('standard_delivery_charge', { precision: 10, scale: 2 })
      .notNull()
      .default('50.00'),
    shipping_charge_strategy: ShippingChargeStrategyEnum(
      'shipping_charge_strategy',
    )
      .notNull()
      .default(ShippingChargeStrategy.STANDARD_FLAT_RATE),

    created_at: pg.timestamp('created_at').notNull().defaultNow(),
    updated_at: pg
      .timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deleted_at: pg.timestamp('deleted_at'),
  },
  (t) => [
    pg.uniqueIndex('uq_company_domain').on(t.company_domain),
    pg.index('idx_company_onboarding_status').on(t.onboarding_status),
    pg.index('idx_company_entity_status').on(t.entity_status),
    pg.check(
      'chk_free_shipping_threshold',
      sql`is_free_shipping_enabled = false OR free_delivery_threshold IS NOT NULL`,
    ),
    pg.check(
      'chk_logistics_credentials',
      sql`logistics_mode = 'PLATFORM_PROXY' OR (
        encrypted_logistics_api_key IS NOT NULL AND logistics_pickup_id IS NOT NULL
      )`,
    ),
  ],
);

export const user_roles = pg.pgTable('user_roles', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  role_name: pg.text('role_name').notNull().default(UserRole.ADMIN).unique(),
  description: pg.text('description'),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const user_and_company = pg.pgTable(
  'user_and_company',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    user_id: pg
      .uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    company_id: pg
      .uuid('company_id')
      .notNull()
      .references(() => company.id, { onDelete: 'cascade' }),
    role_id: pg
      .uuid('role_id')
      .notNull()
      .references(() => user_roles.id, { onDelete: 'restrict' }),
    access_status: AccessStatusEnum('access_status')
      .notNull()
      .default(AccessStatus.ACTIVE),
    created_at: pg.timestamp('created_at').notNull().defaultNow(),
    updated_at: pg
      .timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    pg.uniqueIndex('uq_user_company').on(t.user_id, t.company_id),
    pg.index('idx_uac_user_id').on(t.user_id),
    pg.index('idx_uac_company_id').on(t.company_id),
    pg.index('idx_uac_access_status').on(t.access_status),
  ],
);

export const permissions = pg.pgTable('user_permissions', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  permission_name: pg.text('permission_name').notNull(),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
export const role_permissions = pg.pgTable('role_permissions', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  role_id: pg
    .uuid('role_id')
    .references(() => user_roles.id, { onDelete: 'cascade' }),
  permission_id: pg
    .uuid('permission_id')
    .references(() => permissions.id, { onDelete: 'cascade' }),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
export const cms_pages = pg.pgTable('cms_pages', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  title: pg.text('title').notNull(),
  content: pg.text('content').notNull(),
  page_content_type: pg.text('page_content_type').notNull(),
  seo_meta: pg.jsonb('seo_meta').notNull(),
  language: pg.varchar('language', { length: 10 }).notNull().default('en'),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  company_id: pg
    .uuid('company_id')
    .references(() => company.id, { onDelete: 'restrict' }),
  record_status: EntityStatusEnum('record_status').default(EntityStatus.ACTIVE),
  deleted_at: pg.timestamp('deleted_at'),
});

export const refresh_tokens = pg.pgTable('refresh_tokens', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  user_id: pg
    .uuid('user_id')
    .references(() => user.id, { onDelete: 'cascade' }),
  token_hash: pg.text('token_hash').notNull(),
  is_revoked: pg.boolean('is_revoked').default(false).notNull(),
  expires_at: pg.timestamp('expires_at').notNull(),
  created_at: pg
    .timestamp('created_at')
    .$default(() => new Date())
    .notNull(),
});

export const site_maps = pg.pgTable(
  'site_maps',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    company_id: pg
      .uuid('company_id')
      .notNull()
      .references(() => company.id, { onDelete: 'cascade' }),

    /** Stable identifier the rest of the system references — e.g.
     *  'store', 'blog', 'customer_support'. Vendor-defined, not an enum,
     *  so new page types never require a migration. */
    key: pg.varchar('key', { length: 60 }).notNull(),

    /** Admin-facing name shown in selectors, e.g. "Store / Shop", "Blog". */
    label: pg.varchar('label', { length: 120 }).notNull(),

    /** The actual route prefix. This is the one thing allowed to change
     *  freely — e.g. '/store' → '/shop' — without touching nav_items. */
    base_path: pg.text('base_path').notNull(),

    /** searchParams key appended for dynamic targets (category slug,
     *  product id, etc). Null for static pages like /customer/support. */
    default_query_param: pg.varchar('default_query_param', { length: 60 }),

    /** Seeded purposes (store, support) — key can't be deleted, only
     *  base_path edited, so a broken nav item is never possible. */
    is_system: pg.boolean('is_system').notNull().default(false),

    created_at: pg.timestamp('created_at').notNull().defaultNow(),
    updated_at: pg
      .timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    record_status: EntityStatusEnum('record_status').default(
      EntityStatus.ACTIVE,
    ),
    deleted_at: pg.timestamp('deleted_at'),
  },
  (t) => [pg.uniqueIndex('uq_site_maps_company_key').on(t.company_id, t.key)],
);
