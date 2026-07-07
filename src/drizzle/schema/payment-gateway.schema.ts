import * as pg from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { vendor } from './users.schema.js';
import { company } from './main.schema.js';
import {
  PaymentGatewayProvider,
  PaymentRoutingStatus,
} from '../types/types.js';
import {
  CredentialTypeEnum,
  GatewayTypeEnum,
  PaymentRoutingStatusEnum,
} from './enums.schema.js';

export const vendor_payment_gateways = pg.pgTable(
  'vendor_payment_gateways',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    vendor_id: pg
      .uuid('vendor_id')
      .notNull()
      .references(() => vendor.id, { onDelete: 'restrict' }),
    company_id: pg
      .uuid('company_id')
      .notNull()
      .references(() => company.id, { onDelete: 'restrict' }),

    gateway_type: GatewayTypeEnum('gateway_type')
      .notNull()
      .default(PaymentGatewayProvider.RAZORPAY),
    routing_status: PaymentRoutingStatusEnum('routing_status')
      .notNull()
      .default(PaymentRoutingStatus.VAULTED),
    is_active: pg.boolean('is_active').notNull().default(true),
    is_verified: pg.boolean('is_verified').notNull().default(false),
    last_verified_at: pg.timestamp('last_verified_at'),
    verified_by: pg.uuid('verified_by'), // FK to user/admin who verified
    created_at: pg.timestamp('created_at').notNull().defaultNow(),
    updated_at: pg
      .timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deleted_at: pg.timestamp('deleted_at'),
  },
  (table) => [
    pg
      .uniqueIndex('idx_vendor_gateways_vendor_company_type_uniq')
      .on(table.vendor_id, table.company_id, table.gateway_type),
    pg.index('idx_vendor_gateways_company_id').on(table.company_id),
    pg.index('idx_vendor_gateways_routing_status').on(table.routing_status),
  ],
);

export const vendor_credentials = pg.pgTable(
  'vendor_credentials',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    vendor_payment_gateway_id: pg
      .uuid('vendor_payment_gateway_id')
      .notNull()
      .references(() => vendor_payment_gateways.id, { onDelete: 'restrict' }),

    credential_type: CredentialTypeEnum('credential_type').notNull(),
    public_identifier: pg.text('public_identifier'),
    encrypted_value: pg.text('encrypted_value'),
    iv: pg.text('iv'),
    tag: pg.text('tag'),
    encryption_key_version: pg
      .integer('encryption_key_version')
      .notNull()
      .default(1),

    created_at: pg.timestamp('created_at').notNull().defaultNow(),
    updated_at: pg
      .timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    pg
      .uniqueIndex('idx_vendor_creds_gateway_type_uniq')
      .on(table.vendor_payment_gateway_id, table.credential_type),
    pg.index('idx_vendor_creds_key_version').on(table.encryption_key_version),
    pg.check(
      'chk_credential_has_value',
      sql`(public_identifier IS NOT NULL AND encrypted_value IS NULL)
       OR (encrypted_value IS NOT NULL AND iv IS NOT NULL AND tag IS NOT NULL)`,
    ),
  ],
);
