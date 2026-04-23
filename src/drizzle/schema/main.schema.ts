import * as pg from 'drizzle-orm/pg-core';
import { UserRole, UserStatus } from '../types/types';
import { user } from './users.schema';
export const companyEnum = pg.pgEnum('company_enum', UserStatus);
export const company = pg.pgTable('company', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  company_name: pg.text('company_name').notNull(),
  company_domain: pg.text('company_domain').notNull(),
  company_structure: pg.text('company_structure').notNull(),
  company_status: companyEnum('company_status').default(UserStatus.PENDING),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
export const UserRoleEnum = pg.pgEnum('user_role_enum', [
  UserRole.ADMIN,
  UserRole.VENDOR,
  UserRole.CUSTOMER,
]);
export const user_roles = pg.pgTable('user_roles', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  role_name: pg.text('role_name').notNull().default(UserRole.ADMIN),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

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
  role_id: pg.uuid('role_id').references(() => user_roles.id),
  permission_id: pg.uuid('permission_id').references(() => permissions.id),
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
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  company_id: pg.uuid('company_id').references(() => company.id),
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
