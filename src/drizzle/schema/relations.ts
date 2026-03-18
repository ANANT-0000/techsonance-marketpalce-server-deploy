import { relations } from 'drizzle-orm';
import {
  company,
  user_roles,
  permissions,
  role_permissions,
  cms_pages,
  user,
  vendor,
  address,
  coupons,
  carts,
  wishlist,
  coupon_usage,
  products,
  orders,
  product_reviews,
  payments,
  shipping_details,
  refunds,
  categories,
  product_variants,
  product_images,
  order_items,
  tax_rates,
  product_tax,
  gst_registrations,
  gst_invoices,
  audit_logs,
  inventory,
  warehouse,
  refresh_tokens,
} from './index';
// --- Company Relations ---
export const companyRelations = relations(company, ({ many }) => ({
  roles: many(user_roles), // One company can have multiple role definitions
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
export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.category_id],
    references: [categories.id],
  }),
  variants: many(product_variants),
  images: many(product_images),
  vendor: one(vendor, {
    fields: [products.vendor_id],
    references: [vendor.id],
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
    reviews: many(product_reviews),
  }),
);

export const ordersRelations = relations(orders, ({ one, many }) => ({
  items: many(order_items),
  payment: one(payments, {
    fields: [orders.id],
    references: [payments.order_id],
  }),
  shipping: one(shipping_details, {
    fields: [orders.id],
    references: [shipping_details.order_id],
  }),
}));
export const gstInvoicesRelations = relations(gst_invoices, ({ one }) => ({
  order: one(orders, {
    fields: [gst_invoices.order_id],
    references: [orders.id],
  }),
  company: one(company, {
    fields: [gst_invoices.company_id],
    references: [company.id],
  }),
  registration: one(gst_registrations, {
    fields: [gst_invoices.gst_registration_id],
    references: [gst_registrations.id],
  }),
}));

// --- Product Tax Mapping ---
export const productTaxRelations = relations(product_tax, ({ one }) => ({
  product: one(products, {
    fields: [product_tax.product_id],
    references: [products.id],
  }),
  taxRate: one(tax_rates, {
    fields: [product_tax.tax_rate_id],
    references: [tax_rates.id],
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
