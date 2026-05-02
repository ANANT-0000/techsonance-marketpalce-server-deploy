import * as pg from 'drizzle-orm/pg-core';
import { company, user_roles } from './main.schema';
import { UserStatus } from '../types/types';

export const UserStatusEnum = pg.pgEnum('user_status_enum', UserStatus);
export const user = pg.pgTable(
  'user',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    profile_picture_url: pg.text('profile_picture_url'),
    first_name: pg.text('first_name'),
    last_name: pg.text('last_name'),
    email: pg.text('email').notNull().unique(),
    country_code: pg.text('country_code'),
    phone_number: pg.text('phone_number').unique(),
    password_hash: pg.text('password_hash').notNull(),
    user_status: UserStatusEnum().default(UserStatus.PENDING),
    otp: pg.varchar('otp', { length: 6 }),
    otpExpires: pg.timestamp('otp_expires'),
    created_at: pg.timestamp('created_at').notNull().defaultNow(),
    updated_at: pg
      .timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    company_id: pg.uuid('company_id').references(() => company.id),
    role_id: pg.uuid('role_id').references(() => user_roles.id),
  },
  (table) => [
    pg.index('idx_users_company_id').on(table.company_id),
    pg.index('idx_user_email').on(table.email),
    pg.index('idx_user_first_name').on(table.first_name),
    pg.index('idx_user_last_name').on(table.last_name),
    pg.index('idx_user_role_id').on(table.role_id),
    pg.index('idx_user_status').on(table.user_status),
  ],
);
export const vendor = pg.pgTable('vendor', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  store_owner_first_name: pg.text('store_owner_first_name').notNull(),
  store_owner_last_name: pg.text('store_owner_last_name').notNull(),
  store_name: pg.text('store_name').notNull(),
  store_description: pg.text('store_description'),
  category: pg.text('category').notNull(),
  vendor_status: UserStatusEnum().default(UserStatus.PENDING),
  is_verified: pg.boolean('is_verified').notNull().default(false),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  company_id: pg.uuid('company_id').references(() => company.id),
  user_id: pg
    .uuid('user_id')
    .references(() => user.id, { onDelete: 'cascade' }),
});
export const address = pg.pgTable('address', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  name: pg.text('name').notNull(),
  number: pg.text('number').notNull(),
  address_type: pg.text('address_type').notNull(),
  address_line_1: pg.text('address_line_1').notNull(),
  address_line_2: pg.text('address_line_2').notNull(),
  street: pg.text('street').notNull(),
  city: pg.text('city').notNull(),
  state: pg.text('state').notNull(),
  postal_code: pg.text('postal_code').notNull(),
  country: pg.text('country').notNull(),
  landmark: pg.text('landmark').notNull(),
  is_default: pg.boolean('is_default').notNull().default(false),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  user_id: pg
    .uuid('user_id')
    .references(() => user.id, { onDelete: 'cascade' }),
  company_id: pg.uuid('company_id').references(() => company.id),
});
