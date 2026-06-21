import * as pg from 'drizzle-orm/pg-core';
import { company } from './main.schema';
import { EntityStatusEnum } from './enums.schema';
import { address, user, vendor } from './users.schema';
import {
  CancelledByEnum,
  OrderStatus,
  PaymentStatus,
  productImageType,
  ProductStatus,
  RefundStatusEnum,
  ReturnStatus,
  ReturnType,
  ShippingStatus,
  EntityStatus,
} from '../types/types';
import { AnyPgColumn } from 'drizzle-orm/pg-core';
import { unique } from 'drizzle-orm/pg-core';

export const categories = pg.pgTable(
  'categories',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    name: pg.text('name').notNull(),
    slug: pg.varchar('slug', { length: 160 }).notNull(),
    description: pg.text('description'),
    parent_id: pg
      .uuid('parent_id')
      .references((): AnyPgColumn => categories.id, { onDelete: 'cascade' }),
    created_at: pg.timestamp('created_at').notNull().defaultNow(),
    updated_at: pg
      .timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    icon_url: pg.text('icon_url'),
    company_id: pg.uuid('company_id').references(() => company.id),
    show_in_nav: pg.boolean('show_in_nav').notNull().default(true),
    nav_order: pg.integer('nav_order').notNull().default(0),
    record_status: EntityStatusEnum('record_status').default(
      EntityStatus.ACTIVE,
    ),
    deleted_at: pg.timestamp('deleted_at'),
  },
  (t) => [
    pg.index('idx_categories_name').on(t.name),
    pg.index('idx_categories_parent_id').on(t.parent_id),
    pg.uniqueIndex('uq_categories_company_slug').on(t.company_id, t.slug),
  ],
);
export const coupons = pg.pgTable('coupons', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  company_id: pg
    .uuid('company_id')
    .references(() => company.id, { onDelete: 'cascade' })
    .notNull(),
  code: pg.text('code').notNull(),
  description: pg.text('description'),
  is_active: pg.boolean('is_active').notNull().default(true),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
});

export const carts = pg.pgTable('carts', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  company_id: pg
    .uuid('company_id')
    .references(() => company.id, { onDelete: 'cascade' }),
  user_id: pg
    .uuid('user_id')
    .references(() => user.id, { onDelete: 'cascade' }),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const wishlist = pg.pgTable('wishlist', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  company_id: pg
    .uuid('company_id')
    .references(() => company.id, { onDelete: 'cascade' }),
  user_id: pg
    .uuid('user_id')
    .references(() => user.id, { onDelete: 'cascade' }),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
export const coupon_usage = pg.pgTable('coupon_usage', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  company_id: pg
    .uuid('company_id')
    .references(() => company.id, { onDelete: 'cascade' })
    .notNull(),
  coupon_id: pg
    .uuid('coupon_id')
    .references(() => coupons.id, { onDelete: 'cascade' })
    .notNull(),
  user_id: pg
    .uuid('user_id')
    .references(() => user.id, { onDelete: 'cascade' })
    .notNull(),
  order_id: pg
    .uuid('order_id')
    .references(() => orders.id, { onDelete: 'cascade' })
    .notNull(),
  discount_applied: pg
    .decimal('discount_applied', { precision: 10, scale: 2 })
    .notNull(),

  created_at: pg.timestamp('created_at').defaultNow().notNull(),
});

export const ProductStatusEnum = pg.pgEnum(
  'product_status_enum',
  ProductStatus,
);
export const products = pg.pgTable(
  'products',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    name: pg.text('name').notNull(),
    description: pg.text('description').notNull(),
    features: pg.jsonb('features').notNull(),
    base_price: pg.decimal('base_price', { precision: 10, scale: 2 }).notNull(),
    discount_percent: pg
      .decimal('discount_percent', { precision: 10, scale: 2 })
      .notNull(),
    status: ProductStatusEnum().notNull().default(ProductStatus.INACTIVE),
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
    company_id: pg
      .uuid('company_id')
      .references(() => company.id, { onDelete: 'cascade' }),
    vendor_id: pg
      .uuid('vendor_id')
      .references(() => vendor.id, { onDelete: 'cascade' }),
    category_id: pg
      .uuid('category_id')
      .references(() => categories.id, { onDelete: 'no action' }),
  },
  (table) => [
    pg.index('idx_products_company_id').on(table.company_id),
    pg.index('idx_products_vendor_id').on(table.vendor_id),
    pg.index('idx_products_category_id').on(table.category_id),
    pg.index('idx_products_name').on(table.name),
    pg.index('idx_products_status').on(table.status),
  ],
);
export const order_status_enum = pg.pgEnum('order_status_enum', OrderStatus);
export const orders = pg.pgTable(
  'orders',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    total_amount: pg
      .decimal('total_amount', { precision: 10, scale: 2 })
      .notNull(),
    created_at: pg.timestamp('created_at').notNull().defaultNow(),
    updated_at: pg
      .timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    user_id: pg
      .uuid('user_id')
      .references(() => user.id, { onDelete: 'cascade' }),
    address_id: pg
      .uuid('address_id')
      .references(() => address.id, { onDelete: 'cascade' }),
    company_id: pg.uuid('company_id').references(() => company.id),
    order_status: order_status_enum('order_status')
      .notNull()
      .default(OrderStatus.PENDING),
    record_status: EntityStatusEnum('record_status').default(
      EntityStatus.ACTIVE,
    ),
    deleted_at: pg.timestamp('deleted_at'),
  },
  (table) => [
    pg.index('idx_orders_user_id').on(table.user_id),
    pg.index('idx_orders_address_id').on(table.address_id),
    pg.index('idx_orders_company_id').on(table.company_id),
    pg.index('idx_orders_created_at').on(table.created_at),
  ],
);
export const order_items = pg.pgTable(
  'order_items',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    order_id: pg.uuid('order_id').references(() => orders.id),
    product_variant_id: pg
      .uuid('product_variant_id')
      .references(() => product_variants.id),
    company_id: pg.uuid('company_id').references(() => company.id),
    quantity: pg.integer('quantity').notNull(),
    price: pg.decimal('price', { precision: 10, scale: 2 }).notNull(),
    order_status: order_status_enum('order_status').notNull(),
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
  (table) => [pg.index('idx_order_items_order_id').on(table.order_id)],
);
export const coupon_products = pg.pgTable(
  'coupon_products',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    coupon_id: pg
      .uuid('coupon_id')
      .references(() => coupons.id, { onDelete: 'cascade' })
      .notNull(),
    product_id: pg
      .uuid('product_id')
      .references(() => products.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (t) => [pg.uniqueIndex('unq_coupon_product').on(t.coupon_id, t.product_id)],
);
export const cancelled_by_enum = pg.pgEnum('canceled_by_enum', CancelledByEnum);
export const order_item_cancelled = pg.pgTable('order_item_canceled', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  order_item_id: pg
    .uuid('order_item_id')
    .references(() => order_items.id, { onDelete: 'cascade' }),
  reason: pg.text('reason').notNull(),
  cancelled_by: cancelled_by_enum('cancelled_by').notNull(),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  user_id: pg
    .uuid('user_id')
    .references(() => user.id, { onDelete: 'cascade' }),
  company_id: pg
    .uuid('company_id')
    .references(() => company.id, { onDelete: 'cascade' }),
});
export const product_variants = pg.pgTable(
  'product_variants',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    variant_name: pg.text('variant_name').notNull(),
    sku: pg.text('sku').unique().notNull(),
    price: pg.decimal('price', { precision: 10, scale: 2 }).notNull(),
    attributes: pg.jsonb('attributes').notNull(),
    status: ProductStatusEnum().notNull().default(ProductStatus.INACTIVE),
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
    product_id: pg
      .uuid('product_id')
      .references(() => products.id, { onDelete: 'cascade' }),
  },
  (table) => [
    pg.index('idx_product_variants_product_id').on(table.product_id),
    pg.index('idx_product_variants_variant_name').on(table.variant_name),
    pg.index('idx_product_variants_sku').on(table.sku),
    pg.index('idx_product_variants_status').on(table.status),
  ],
);
export const productImageTypeEnum = pg.pgEnum(
  'product_image_type_enum',
  productImageType,
);
export const product_images = pg.pgTable('product_images', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  image_url: pg.text('image_url').notNull(),
  alt_text: pg.text('alt_text'),
  imgType: productImageTypeEnum(),
  is_primary: pg.boolean('is_primary').notNull().default(false),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  product_id: pg
    .uuid('product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .notNull(),
  variant_id: pg
    .uuid('variant_id')
    .references(() => product_variants.id, { onDelete: 'cascade' }),
});
export const cart_items = pg.pgTable(
  'cart_items',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    cart_id: pg
      .uuid('cart_id')
      .references(() => carts.id, { onDelete: 'cascade' }),
    product_variant_id: pg
      .uuid('product_variant_id')
      .references(() => product_variants.id, { onDelete: 'cascade' }),
    quantity: pg.integer('quantity').notNull(),
    created_at: pg.timestamp('created_at').notNull().defaultNow(),
    updated_at: pg
      .timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique('cartProductUnique').on(table.cart_id, table.product_variant_id),
  ],
);
export const product_reviews = pg.pgTable('product_reviews', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  rating: pg.integer('rating').notNull(),
  review: pg.text('review'),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  product_variant_id: pg
    .uuid('product_variant_id')
    .references(() => product_variants.id, { onDelete: 'cascade' }),
  user_id: pg
    .uuid('user_id')
    .references(() => user.id, { onDelete: 'cascade' }),
  company_id: pg
    .uuid('company_id')
    .references(() => company.id, { onDelete: 'cascade' }),
});
export const wishlist_items = pg.pgTable(
  'wishlist_items',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    wishlist_id: pg
      .uuid('wishlist_id')
      .references(() => wishlist.id, { onDelete: 'cascade' }),
    product_variant_id: pg
      .uuid('product_variant_id')
      .references(() => product_variants.id, { onDelete: 'cascade' }),
    created_at: pg.timestamp('created_at').notNull().defaultNow(),
    updated_at: pg
      .timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique('wishlistProductUnique').on(
      table.wishlist_id,
      table.product_variant_id,
    ),
  ],
);

export const payment_status_enum = pg.pgEnum(
  'payment_status_enum',
  PaymentStatus,
);
export const payments = pg.pgTable(
  'payments',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    payment_method: pg.text('payment_method').notNull(),
    payment_status: payment_status_enum('payment_status').notNull(),
    transaction_ref: pg.text('transaction_ref').notNull(),
    amount: pg.decimal('amount', { precision: 10, scale: 2 }).notNull(),
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
    order_id: pg.uuid('order_id').references(() => orders.id),
    company_id: pg.uuid('company_id').references(() => company.id),
  },
  (table) => [
    pg.index('idx_payments_order_id').on(table.order_id),
    pg.index('idx_payments_company_id').on(table.company_id),
    pg.index('idx_payments_payment_status').on(table.payment_status),
    pg.index('idx_payments_ref').on(table.transaction_ref),
  ],
);

export const shipping_status_enum = pg.pgEnum(
  'shipping_status_enum',
  ShippingStatus,
);
export const shipping_details = pg.pgTable('shipping_details', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  tracking_url: pg.text('tracking_url').notNull(),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  order_id: pg
    .uuid('order_id')
    .references(() => orders.id, { onDelete: 'cascade' }),
  company_id: pg.uuid('company_id').references(() => company.id),
});

export const refund_status_enum = pg.pgEnum(
  'refund_status_enum',
  RefundStatusEnum,
);
export const refunds = pg.pgTable(
  'refunds',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    refund_amount: pg
      .decimal('refund_amount', { precision: 10, scale: 2 })
      .notNull(),
    refund_reason: pg.text('refund_reason').notNull(),
    refund_status: refund_status_enum('refund_status').notNull(),
    created_at: pg
      .timestamp('created_at')
      .$default(() => new Date())
      .notNull(),
    record_status: EntityStatusEnum('record_status').default(
      EntityStatus.ACTIVE,
    ),
    deleted_at: pg.timestamp('deleted_at'),
    order_id: pg.uuid('order_id').references(() => orders.id),
    order_items_id: pg.uuid('order_items_id').references(() => order_items.id),
    payment_id: pg.uuid('payment_id').references(() => payments.id),
    company_id: pg
      .uuid('company_id')
      .references(() => company.id, { onDelete: 'cascade' }),
  },
  (table) => [
    pg.index('idx_refunds_order_id').on(table.order_id),
    pg.index('idx_refunds_payment_id').on(table.payment_id),
    pg.index('idx_refunds_company_id').on(table.company_id),
    pg.index('idx_refunds_status').on(table.refund_status),
    pg.index('idx_refunds_created_at').on(table.created_at),
  ],
);

export const returnTypeEnum = pg.pgEnum('return_type_enum', ReturnType);

export const returnStatusEnum = pg.pgEnum('return_status_enum', ReturnStatus);

export const return_requests = pg.pgTable(
  'return_requests',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    order_item_id: pg
      .uuid('order_item_id')
      .references(() => order_items.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),
    user_id: pg
      .uuid('user_id')
      .references(() => user.id, { onDelete: 'cascade' })
      .notNull(),
    company_id: pg
      .uuid('company_id')
      .references(() => company.id, { onDelete: 'cascade' })
      .notNull(),
    type: returnTypeEnum('type').notNull(),
    status: returnStatusEnum('status').default(ReturnStatus.PENDING).notNull(),
    reason: pg.text('reason').notNull(),
    customer_note: pg.text('customer_note'),
    store_owner_note: pg.text('store_owner_note'),
    evidence_images: pg.jsonb('evidence_images'),
    tracking_id: pg.text('tracking_id'),
    return_label_url: pg.text('return_label_url'),
    outbound_tracking_number: pg.text('outbound_tracking_number'),
    return_tracking_number: pg.text('return_tracking_number'),
    created_at: pg.timestamp('created_at').notNull().defaultNow(),
    updated_at: pg
      .timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    pg.index('idx_return_requests_company_id').on(table.company_id),
    pg.index('idx_return_requests_user_id').on(table.user_id),
    pg.index('idx_return_requests_status').on(table.status),
  ],
);
export const invoices = pg.pgTable('invoices', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  invoice_number: pg
    .varchar('invoice_number', { length: 100 })
    .notNull()
    .unique(),
  invoice_url: pg.text('invoice_url').notNull(),
  order_id: pg
    .uuid('order_id')
    .references(() => orders.id)
    .notNull(),
  order_item_id: pg
    .uuid('order_item_id')
    .references(() => order_items.id)
    .notNull(),
  company_id: pg
    .uuid('company_id')
    .references(() => company.id, { onDelete: 'cascade' })
    .notNull(),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  status: EntityStatusEnum('status').default(EntityStatus.ACTIVE),
  deleted_at: pg.timestamp('deleted_at'),
});
