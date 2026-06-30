import * as pg from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { vendor } from './users.schema';
import { company } from './main.schema';
import { LogisticsModeEnum } from './enums.schema';
import { ShippingChargeStrategy, PaymentRoutingStatus } from '../types/types';

export const ShippingChargeStrategyEnum = pg.pgEnum(
  'shipping_charge_strategy_enum',
  [
    ShippingChargeStrategy.DYNAMIC_CUSTOMER_RATE,
    ShippingChargeStrategy.STANDARD_FLAT_RATE,
  ],
);

export const PaymentRoutingStatusEnum = pg.pgEnum(
  'payment_routing_status_enum',
  [
    PaymentRoutingStatus.VAULTED,
    PaymentRoutingStatus.ROTATED,
    PaymentRoutingStatus.SUSPENDED,
  ],
);

export const GatewayTypeEnum = pg.pgEnum('gateway_type_enum', [
  'razorpay',
  'stripe',
]);

export const CredentialTypeEnum = pg.pgEnum('credential_type_enum', [
  // Razorpay
  'razorpay_key_id',
  'razorpay_key_secret',
  'razorpay_webhook_secret',
  // Stripe
  'stripe_publishable_key',
  'stripe_secret_key',
  'stripe_webhook_secret',
  // Generic escape hatch
  'custom_api_key',
  'custom_api_secret',
]);

export const vendor_gateways = pg.pgTable(
  'vendor_gateways',
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

    gateway_type: GatewayTypeEnum('gateway_type').notNull().default('razorpay'),
    shipping_charge_strategy: ShippingChargeStrategyEnum(
      'shipping_charge_strategy',
    ).notNull(),
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
    vendor_gateway_id: pg
      .uuid('vendor_gateway_id')
      .notNull()
      .references(() => vendor_gateways.id, { onDelete: 'restrict' }),

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
      .on(table.vendor_gateway_id, table.credential_type),
    pg.index('idx_vendor_creds_key_version').on(table.encryption_key_version),
    pg.check(
      'chk_credential_has_value',
      sql`(public_identifier IS NOT NULL AND encrypted_value IS NULL)
       OR (encrypted_value IS NOT NULL AND iv IS NOT NULL AND tag IS NOT NULL)`,
    ),
  ],
);

export type VendorGateway = typeof vendor_gateways.$inferSelect;
export type NewVendorGateway = typeof vendor_gateways.$inferInsert;

export type VendorCredential = typeof vendor_credentials.$inferSelect;
export type NewVendorCredential = typeof vendor_credentials.$inferInsert;
