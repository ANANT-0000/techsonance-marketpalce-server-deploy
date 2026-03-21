import * as pg from 'drizzle-orm/pg-core';
import { address, company, user, vendor } from '.';
import {
  OrderStatus,
  PaymentStatus,
  productImageType,
  ProductStatus,
  ShippingStatus,
} from '../types/types';
import { AnyPgColumn } from 'drizzle-orm/pg-core';

export const categories = pg.pgTable('categories', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  name: pg.text('name').notNull(),
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
});
export const coupons = pg.pgTable('coupons', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  code: pg.text('code').notNull(),
  description: pg.text('description').notNull(),
  discount_type: pg.text('discount_type').notNull(),
  discount_value: pg
    .decimal('discount_value', { precision: 10, scale: 2 })
    .notNull(),
  valid_from: pg.timestamp('valid_from').notNull(),
  valid_to: pg.timestamp('valid_to').notNull(),
  is_active: pg.boolean('is_active').notNull().default(true),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  company_id: pg.uuid('company_id').references(() => company.id),
});
export const carts = pg.pgTable('carts', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  company_id: pg.uuid('company_id').references(() => company.id),
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
  company_id: pg.uuid('company_id').references(() => company.id),
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
  coupon_id: pg.uuid('coupon_id').references(() => coupons.id),
  user_id: pg
    .uuid('user_id')
    .references(() => user.id, { onDelete: 'cascade' }),
  company_id: pg.uuid('company_id').references(() => company.id),
  created_at: pg
    .timestamp('created_at')
    .$default(() => new Date())
    .notNull(),
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
    stock_quantity: pg.integer('stock_quantity').default(0),
    status: ProductStatusEnum().notNull().default(ProductStatus.INACTIVE),
    has_variants: pg.boolean('has_variants').notNull().default(false),
    created_at: pg.timestamp('created_at').notNull().defaultNow(),
    updated_at: pg
      .timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    company_id: pg.uuid('company_id').references(() => company.id),
    vendor_id: pg
      .uuid('vendor_id')
      .references(() => vendor.id, { onDelete: 'cascade' }),
    category_id: pg.uuid('category_id').references(() => categories.id),
  },
  (table) => [
    pg.index('idx_products_company_id').on(table.company_id),
    pg.index('idx_products_vendor_id').on(table.vendor_id),
    pg.index('idx_products_category_id').on(table.category_id),
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
    order_status: order_status_enum().notNull(),
    created_at: pg.timestamp('created_at').notNull().defaultNow(),
    updated_at: pg
      .timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    user_id: pg
      .uuid('user_id')
      .references(() => user.id, { onDelete: 'cascade' }),
    address_id: pg.uuid('address_id').references(() => address.id),
    company_id: pg.uuid('company_id').references(() => company.id),
  },
  (table) => [
    pg.index('idx_orders_user_id').on(table.user_id),
    pg.index('idx_orders_address_id').on(table.address_id),
    pg.index('idx_orders_company_id').on(table.company_id),
    pg.index('idx_orders_order_status').on(table.order_status),
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
    quantity: pg.integer('quantity').notNull(),
    price: pg.decimal('price', { precision: 10, scale: 2 }).notNull(),
    created_at: pg.timestamp('created_at').notNull().defaultNow(),
    updated_at: pg
      .timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [pg.index('idx_order_items_order_id').on(table.order_id)],
);
export const product_variants = pg.pgTable(
  'product_variants',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    variant_name: pg.text('variant_name').notNull(),
    sku: pg.text('sku').unique().notNull(),
    price: pg.decimal('price', { precision: 10, scale: 2 }).notNull(),
    attributes: pg.jsonb('attributes').notNull(),
    status: ProductStatusEnum().notNull().default(ProductStatus.INACTIVE),
    stock_quantity: pg.integer('stock_quantity').default(0),
    seo_meta: pg.jsonb('seo_meta'),
    created_at: pg.timestamp('created_at').notNull().defaultNow(),
    updated_at: pg
      .timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    product_id: pg
      .uuid('product_id')
      .references(() => products.id, { onDelete: 'cascade' }),
  },
  (table) => [
    pg.index('idx_product_variants_product_id').on(table.product_id),
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
  variants_id: pg
    .uuid('variants_id')
    .references(() => product_variants.id, { onDelete: 'cascade' }),
});
export const cart_items = pg.pgTable('cart_items', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  cart_id: pg.uuid('cart_id').references(() => carts.id),
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
});
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
  company_id: pg.uuid('company_id').references(() => company.id),
});
export const wishlist_items = pg.pgTable('wishlist_items', {
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
});

export const payment_status_enum = pg.pgEnum(
  'payment_status_enum',
  PaymentStatus,
);
export const payments = pg.pgTable(
  'payments',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    payment_method: pg.text('payment_method').notNull(),
    payment_status: payment_status_enum().notNull(),
    transaction_ref: pg.text('transaction_ref').notNull(),
    amount: pg.decimal('amount', { precision: 10, scale: 2 }).notNull(),
    created_at: pg.timestamp('created_at').notNull().defaultNow(),
    updated_at: pg
      .timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
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
  shipping_method: pg.text('shipping_method').notNull(),
  tracking_number: pg.text('tracking_number').notNull(),
  carrier: pg.text('carrier').notNull(),
  estimated_delivery: pg.date('estimated_delivery').notNull(),
  shipping_status: shipping_status_enum().notNull(),
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  order_id: pg.uuid('order_id').references(() => orders.id),
  company_id: pg.uuid('company_id').references(() => company.id),
});

export const refunds = pg.pgTable(
  'refunds',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    refund_amount: pg
      .decimal('refund_amount', { precision: 10, scale: 2 })
      .notNull(),
    refund_reason: pg.text('refund_reason').notNull(),
    refund_status: pg.text('refund_status').notNull(),
    created_at: pg
      .timestamp('created_at')
      .$default(() => new Date())
      .notNull(),
    order_id: pg.uuid('order_id').references(() => orders.id),
    payment_id: pg.uuid('payment_id').references(() => payments.id),
    company_id: pg.uuid('company_id').references(() => company.id),
  },
  (table) => [
    pg.index('idx_refunds_order_id').on(table.order_id),
    pg.index('idx_refunds_payment_id').on(table.payment_id),
    pg.index('idx_refunds_company_id').on(table.company_id),
    pg.index('idx_refunds_status').on(table.refund_status),
    pg.index('idx_refunds_created_at').on(table.created_at),
  ],
);
