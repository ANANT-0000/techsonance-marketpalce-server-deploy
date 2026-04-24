export * from './finance.schema';
export * from './shop.schema';
export * from './users.schema';
export * from './utils.schema';
export * from './main.schema';
import { address, user, vendor } from './users.schema';
import {
  cart_items,
  carts,
  categories,
  coupon_usage,
  coupons,
  order_item_cancelled,
  order_items,
  orders,
  payments,
  product_images,
  product_reviews,
  product_variants,
  products,
  refunds,
  shipping_details,
  wishlist,
  wishlist_items,
} from './shop.schema';
import { relations } from 'drizzle-orm';
import {
  cms_pages,
  company,
  permissions,
  refresh_tokens,
  role_permissions,
  user_roles,
} from './main.schema';
import {
  audit_logs,
  inventory,
  vendor_document,
  warehouse,
} from './utils.schema';

export const companyRelations = relations(company, ({ many }) => ({
  roles: many(user_roles),
  pages: many(cms_pages),
  user: many(user),
  vendor: many(vendor),
  address: many(address),
  coupons: many(coupons),
  carts: many(carts),
  wishlist: many(wishlist),
  coupon_usage: many(coupon_usage),
  products: many(products),
  orders: many(orders),
  product_reviews: many(product_reviews),
  payments: many(payments),
  shipping_details: many(shipping_details),
  refunds: many(refunds),
}));

// --- User Relations ---
export const userRelations = relations(user, ({ one, many }) => ({
  company: one(company, {
    fields: [user.company_id],
    references: [company.id],
  }),
  role: one(user_roles, {
    fields: [user.role_id],
    references: [user_roles.id],
  }),
  vendor: one(vendor, {
    fields: [user.id],
    references: [vendor.user_id],
  }),
  refresh_tokens: one(refresh_tokens, {
    fields: [user.id],
    references: [refresh_tokens.user_id],
  }),
  address: many(address),
  orders: many(orders),
  reviews: many(product_reviews),
  wishlist: many(wishlist),
  carts: many(carts),
}));

// --- User Roles Relations ---
export const userRolesRelations = relations(user_roles, ({ many }) => ({
  rolePermissions: many(role_permissions), // Link to the join table
  users: many(user), // One role can be assigned to multiple users
}));

// --- Permissions Relations ---
export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(role_permissions),
}));

// --- Role Permissions (Join Table) Relations ---
export const rolePermissionsRelations = relations(
  role_permissions,
  ({ one }) => ({
    role: one(user_roles, {
      fields: [role_permissions.role_id],
      references: [user_roles.id],
    }),
    permission: one(permissions, {
      fields: [role_permissions.permission_id],
      references: [permissions.id],
    }),
  }),
);
export const vendorRelations = relations(vendor, ({ one, many }) => ({
  company: one(company, {
    fields: [vendor.company_id],
    references: [company.id],
  }),
  user: one(user, {
    fields: [vendor.user_id],
    references: [user.id],
  }),
  documents: many(vendor_document),
}));
export const documentRelations = relations(vendor_document, ({ one }) => ({
  vendor: one(vendor, {
    fields: [vendor_document.vendor_id],
    references: [vendor.id],
  }),
}));
export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.category_id],
    references: [categories.id],
  }),
  variants: many(product_variants),
  images: many(product_images),
  reviews: many(product_reviews),
  vendor: one(vendor, {
    fields: [products.vendor_id],
    references: [vendor.id],
  }),
}));

export const productImagesRelations = relations(product_images, ({ one }) => ({
  product: one(products, {
    fields: [product_images.product_id],
    references: [products.id],
  }),
  variant: one(product_variants, {
    fields: [product_images.variant_id],
    references: [product_variants.id],
  }),
}));
export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parent_id],
    references: [categories.id],
    relationName: 'sub_categories',
  }),
  children: many(categories, {
    relationName: 'sub_categories',
  }),
}));

export const productVariantsRelations = relations(
  product_variants,
  ({ one, many }) => ({
    product: one(products, {
      fields: [product_variants.product_id],
      references: [products.id],
    }),
    orderItem: many(order_items),
    images: many(product_images),
    reviews: many(product_reviews),
    inventory: one(inventory, {
      fields: [product_variants.id],
      references: [inventory.product_variant_id],
    }),
  }),
);
export const productReviewRelations = relations(product_reviews, ({ one }) => ({
  user: one(user, {
    fields: [product_reviews.user_id],
    references: [user.id],
  }),
  company: one(company, {
    fields: [product_reviews.company_id],
    references: [company.id],
  }),
  variant: one(product_variants, {
    fields: [product_reviews.product_variant_id],
    references: [product_variants.id],
  }),
}));
export const wishlistRelations = relations(wishlist, ({ one, many }) => ({
  user: one(user, {
    fields: [wishlist.user_id],
    references: [user.id],
  }),
  company: one(company, {
    fields: [wishlist.company_id],
    references: [company.id],
  }),
  items: many(wishlist_items),
}));
export const wishlistItemsRelations = relations(wishlist_items, ({ one }) => ({
  wishlist: one(wishlist, {
    fields: [wishlist_items.wishlist_id],
    references: [wishlist.id],
  }),
  productVariant: one(product_variants, {
    fields: [wishlist_items.product_variant_id],
    references: [product_variants.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  items: many(order_items),
  customer: one(user, {
    fields: [orders.user_id],
    references: [user.id],
  }),
  company: one(company, {
    fields: [orders.company_id],
    references: [company.id],
  }),
  payment: one(payments, {
    fields: [orders.id],
    references: [payments.order_id],
  }),
  refund: one(refunds, {
    fields: [orders.id],
    references: [refunds.order_id],
  }),
  address: one(address, {
    fields: [orders.address_id],
    references: [address.id],
  }),
  shipping: one(shipping_details, {
    fields: [orders.id],
    references: [shipping_details.order_id],
  }),
}));
export const orderItemsRelations = relations(order_items, ({ one }) => ({
  order: one(orders, {
    fields: [order_items.order_id],
    references: [orders.id],
  }),
  variant: one(product_variants, {
    fields: [order_items.product_variant_id],
    references: [product_variants.id],
  }),
  cancelledRecord: one(order_item_cancelled, {
    fields: [order_items.id],
    references: [order_item_cancelled.order_item_id],
  }),
  refund: one(refunds, {
    fields: [order_items.id],
    references: [refunds.order_items_id],
  }),
}));

export const orderItemCancelledRelations = relations(
  order_item_cancelled,
  ({ one }) => ({
    orderItem: one(order_items, {
      fields: [order_item_cancelled.order_item_id],
      references: [order_items.id],
    }),
    company: one(company, {
      fields: [order_item_cancelled.company_id],
      references: [company.id],
    }),
  }),
);
export const refundsRelations = relations(refunds, ({ one }) => ({
  order: one(orders, {
    fields: [refunds.order_id],
    references: [orders.id],
  }),
  orderItem: one(order_items, {
    fields: [refunds.order_items_id],
    references: [order_items.id],
  }),
  payment: one(payments, {
    fields: [refunds.payment_id],
    references: [payments.id],
  }),
  company: one(company, {
    fields: [refunds.company_id],
    references: [company.id],
  }),
}));
export const addressRelations = relations(address, ({ one }) => ({
  user: one(user, {
    fields: [address.user_id],
    references: [user.id],
  }),
  warehouse: one(warehouse, {
    fields: [address.id],
    references: [warehouse.address_id],
  }),
}));
export const couponsRelations = relations(coupons, ({ one, many }) => ({
  company: one(company, {
    fields: [coupons.company_id],
    references: [company.id],
  }),
  usage: many(coupon_usage),
}));
export const couponUsageRelations = relations(coupon_usage, ({ one }) => ({
  coupon: one(coupons, {
    fields: [coupon_usage.coupon_id],
    references: [coupons.id],
  }),
  user: one(user, {
    fields: [coupon_usage.user_id],
    references: [user.id],
  }),
}));

// --- Inventory & Warehouse Relations ---
export const inventoryRelations = relations(inventory, ({ one }) => ({
  variant: one(product_variants, {
    fields: [inventory.product_variant_id],
    references: [product_variants.id],
  }),
  warehouse: one(warehouse, {
    fields: [inventory.warehouse_id],
    references: [warehouse.id],
  }),
}));
export const warehouseRelations = relations(warehouse, ({ many, one }) => ({
  address: one(address, {
    fields: [warehouse.address_id],
    references: [address.id],
  }),
  inventory: many(inventory),
}));

// --- Audit Log Relations ---
export const auditLogsRelations = relations(audit_logs, ({ one }) => ({
  user: one(user, {
    fields: [audit_logs.user_id],
    references: [user.id],
  }),
  company: one(company, {
    fields: [audit_logs.company_id],
    references: [company.id],
  }),
}));
export const cartRelations = relations(carts, ({ one, many }) => ({
  user: one(user, {
    fields: [carts.user_id],
    references: [user.id],
  }),
  company: one(company, {
    fields: [carts.company_id],
    references: [company.id],
  }),
  items: many(cart_items),
}));
export const cartItemsRelations = relations(cart_items, ({ one }) => ({
  cart: one(carts, {
    fields: [cart_items.cart_id],
    references: [carts.id],
  }),
  productVariant: one(product_variants, {
    fields: [cart_items.product_variant_id],
    references: [product_variants.id],
  }),
}));
