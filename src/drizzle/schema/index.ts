export * from './enums.schema';
export * from './users.schema';
export * from './main.schema';
export * from './utils.schema';
export * from './finance.schema';
export * from './shop.schema';
export * from './promotions.schema';
export * from './product_policy.schema';
export * from './company_identity.schema';
export * from './subscription.schema';
export * from './vendor_storefront.schema';
export * from './nav_storefront.schema';
import { address, user, vendor } from './users.schema';
import { vendor_storefront_sections } from './vendor_storefront.schema';
import { nav_menus, nav_items } from './nav_storefront.schema';
import {
  cart_items,
  carts,
  categories,
  coupon_products,
  coupon_usage,
  coupons,
  invoices,
  order_item_cancelled,
  order_items,
  orders,
  payments,
  product_images,
  product_reviews,
  product_variants,
  products,
  refunds,
  return_requests,
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
  site_maps,
  user_and_company,
  user_roles,
} from './main.schema';
import {
  audit_logs,
  inventory,
  templates,
  company_document,
  warehouse,
  support_tickets,
  help_articles,
  customer_feedback,
  ticket_comments,
  notification_settings,
  ticket_ratings,
} from './utils.schema';
import {
  company_branding,
  company_compliance,
  company_document_config,
  company_legal_profile,
} from './company_identity.schema';
import { order_item_policy } from './product_policy.schema';
import {
  customer_segments,
  marketing_banners,
  order_item_promotion_snapshot,
  promotion_analytics_events,
  promotion_usage,
  promotions,
  segment_members,
} from './promotions.schema';
import {
  subscription_events,
  subscription_plans,
  vendor_subscriptions,
} from './subscription.schema';
import { gst_invoices } from './finance.schema';

export const companyRelations = relations(company, ({ one, many }) => ({
  roles: many(user_roles),
  pages: many(cms_pages),
  users: many(user_and_company),
  vendor: one(vendor, {
    fields: [company.id],
    references: [vendor.company_id],
  }),
  userAndCompany: many(user_and_company),
  address: many(address),
  coupons: many(coupons),
  coupon_usage: many(coupon_usage),
  promotions: many(promotions),
  promotion_usage: many(promotion_usage),
  customer_segments: many(customer_segments),
  marketing_banners: many(marketing_banners),
  promotion_analytics_events: many(promotion_analytics_events),
  carts: many(carts),
  wishlist: many(wishlist),
  products: many(products),
  orders: many(orders),
  product_reviews: many(product_reviews),
  payments: many(payments),
  shipping_details: many(shipping_details),
  refunds: many(refunds),
  siteMappings: many(site_maps),
  invoices: many(invoices),
  audit_logs: many(audit_logs),
  inventory: many(inventory),
  warehouse: many(warehouse),
  companyBranding: one(company_branding, {
    fields: [company.id],
    references: [company_branding.company_id],
  }),
  companyLegalProfile: one(company_legal_profile, {
    fields: [company.id],
    references: [company_legal_profile.company_id],
  }),
  companyCompliance: one(company_compliance, {
    fields: [company.id],
    references: [company_compliance.company_id],
  }),
  companyDocumentConfig: one(company_document_config, {
    fields: [company.id],
    references: [company_document_config.company_id],
  }),

  subscription: one(vendor_subscriptions, {
    fields: [company.id],
    references: [vendor_subscriptions.company_id],
  }),
  subscriptionEvents: many(subscription_events),
  subscriptionPlans: many(subscription_plans),
}));

// --- User Relations ---
export const userRelations = relations(user, ({ one, many }) => ({
  userAndCompany: many(user_and_company),
  companies: many(user_and_company),
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
  coupon_usage: many(coupon_usage),
  segment_memberships: many(segment_members),
  promotion_usage: many(promotion_usage),
}));

export const userAndCompanyRelations = relations(
  user_and_company,
  ({ one }) => ({
    user: one(user, {
      fields: [user_and_company.user_id],
      references: [user.id],
    }),
    company: one(company, {
      fields: [user_and_company.company_id],
      references: [company.id],
    }),
    role: one(user_roles, {
      fields: [user_and_company.role_id],
      references: [user_roles.id],
    }),
  }),
);
// --- User Roles Relations ---
export const userRolesRelations = relations(user_roles, ({ many }) => ({
  userAndCompany: many(user_and_company),
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
export const vendorRelations = relations(vendor, ({ one, many }) => ({
  company: one(company, {
    fields: [vendor.company_id],
    references: [company.id],
  }),
  user: one(user, {
    fields: [vendor.user_id],
    references: [user.id],
  }),
  documents: many(company_document),
  storefrontSections: many(vendor_storefront_sections),
}));
export const documentRelations = relations(company_document, ({ one }) => ({
  company: one(company, {
    fields: [company_document.company_id],
    references: [company.id],
  }),
  vendor: one(vendor, {
    fields: [company_document.vendor_id],
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
  couponProducts: many(coupon_products),
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
    relationName: 'subCategories',
  }),
  children: many(categories, {
    relationName: 'subCategories',
  }),
  products: many(products),
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
  couponUsage: many(coupon_usage),
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
  invoice: one(invoices, {
    fields: [orders.id],
    references: [invoices.order_id],
  }),
  gstInvoice: one(gst_invoices, {
    fields: [orders.id],
    references: [gst_invoices.order_id],
  }),
  promotionUsage: many(promotion_usage),
  promotionAnalyticsEvents: many(promotion_analytics_events),
  itemPromotionSnapshots: many(order_item_promotion_snapshot),
}));
export const orderItemsRelations = relations(order_items, ({ one, many }) => ({
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
  return_request: one(return_requests, {
    fields: [order_items.id],
    references: [return_requests.order_item_id],
  }),
  itemPromotionSnapshots: many(order_item_promotion_snapshot),

  invoice: one(invoices, {
    fields: [order_items.id],
    references: [invoices.order_item_id],
  }),
  policy: one(order_item_policy, {
    fields: [order_items.id],
    references: [order_item_policy.order_item_id],
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
export const returnRequestsRelations = relations(
  return_requests,
  ({ one }) => ({
    orderItem: one(order_items, {
      fields: [return_requests.order_item_id],
      references: [order_items.id],
    }),
    user: one(user, {
      fields: [return_requests.user_id],
      references: [user.id],
    }),
    company: one(company, {
      fields: [return_requests.company_id],
      references: [company.id],
    }),
  }),
);
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
  products: many(coupon_products),
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
  order: one(orders, {
    fields: [coupon_usage.order_id],
    references: [orders.id],
  }),
  company: one(company, {
    fields: [coupon_usage.company_id],
    references: [company.id],
  }),
}));
export const couponProductsRelations = relations(
  coupon_products,
  ({ one }) => ({
    coupon: one(coupons, {
      fields: [coupon_products.coupon_id],
      references: [coupons.id],
    }),
    product: one(products, {
      fields: [coupon_products.product_id],
      references: [products.id],
    }),
  }),
);

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
  admin: one(user, {
    fields: [audit_logs.admin_id],
    references: [user.id],
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

export const paymentRelations = relations(payments, ({ one }) => ({
  order: one(orders, {
    fields: [payments.order_id],
    references: [orders.id],
  }),
  refund: one(refunds, {
    fields: [payments.id],
    references: [refunds.payment_id],
  }),
  company: one(company, {
    fields: [payments.company_id],
    references: [company.id],
  }),
}));

export const invoiceRelations = relations(invoices, ({ one }) => ({
  order: one(orders, {
    fields: [invoices.order_id],
    references: [orders.id],
  }),
  orderItem: one(order_items, {
    fields: [invoices.order_item_id],
    references: [order_items.id],
  }),
  company: one(company, {
    fields: [invoices.company_id],
    references: [company.id],
  }),
}));

export const companyBrandingRelations = relations(
  company_branding,
  ({ one }) => ({
    company: one(company, {
      fields: [company_branding.company_id],
      references: [company.id],
    }),
  }),
);

export const companyLegalProfileRelations = relations(
  company_legal_profile,
  ({ one }) => ({
    company: one(company, {
      fields: [company_legal_profile.company_id],
      references: [company.id],
    }),
    registered_address: one(address, {
      fields: [company_legal_profile.registered_address_id],
      references: [address.id],
    }),
  }),
);

export const companyComplianceRelations = relations(
  company_compliance,
  ({ one }) => ({
    company: one(company, {
      fields: [company_compliance.company_id],
      references: [company.id],
    }),
    document: one(company_document, {
      fields: [company_compliance.document_id],
      references: [company_document.id],
    }),
  }),
);

export const companyDocumentConfigRelations = relations(
  company_document_config,
  ({ one }) => ({
    company: one(company, {
      fields: [company_document_config.company_id],
      references: [company.id],
    }),
    default_invoice_template: one(templates, {
      fields: [company_document_config.default_invoice_template_id],
      references: [templates.id],
    }),
  }),
);

export const templateRelations = relations(templates, ({ one }) => ({
  companyDocumentConfig: one(company_document_config, {
    fields: [templates.id],
    references: [company_document_config.default_invoice_template_id],
  }),
  company: one(company, {
    fields: [templates.id],
    references: [company.id],
  }),
  vendor: one(vendor, {
    fields: [templates.id],
    references: [vendor.id],
  }),
}));

export const supportTicketsRelations = relations(
  support_tickets,
  ({ one, many }) => ({
    user: one(user, {
      fields: [support_tickets.user_id],
      references: [user.id],
    }),
    company: one(company, {
      fields: [support_tickets.company_id],
      references: [company.id],
    }),
    order: one(orders, {
      fields: [support_tickets.order_id],
      references: [orders.id],
    }),
    comments: many(ticket_comments),
    rating: one(ticket_ratings, {
      fields: [support_tickets.id],
      references: [ticket_ratings.ticket_id],
    }),
  }),
);

export const ticketCommentsRelations = relations(
  ticket_comments,
  ({ one }) => ({
    ticket: one(support_tickets, {
      fields: [ticket_comments.ticket_id],
      references: [support_tickets.id],
    }),
    user: one(user, {
      fields: [ticket_comments.user_id],
      references: [user.id],
    }),
  }),
);

export const ticketRatingsRelations = relations(ticket_ratings, ({ one }) => ({
  ticket: one(support_tickets, {
    fields: [ticket_ratings.ticket_id],
    references: [support_tickets.id],
  }),
  user: one(user, {
    fields: [ticket_ratings.user_id],
    references: [user.id],
  }),
}));

export const customerFeedbackRelations = relations(
  customer_feedback,
  ({ one }) => ({
    user: one(user, {
      fields: [customer_feedback.user_id],
      references: [user.id],
    }),
    order: one(orders, {
      fields: [customer_feedback.order_id],
      references: [orders.id],
    }),
    ticket: one(support_tickets, {
      fields: [customer_feedback.ticket_id],
      references: [support_tickets.id],
    }),
    company: one(company, {
      fields: [customer_feedback.company_id],
      references: [company.id],
    }),
  }),
);

export const helpArticlesRelations = relations(help_articles, ({ one }) => ({
  company: one(company, {
    fields: [help_articles.company_id],
    references: [company.id],
  }),
}));

export const notificationSettingsRelations = relations(
  notification_settings,
  ({ one }) => ({
    user: one(user, {
      fields: [notification_settings.user_id],
      references: [user.id],
    }),
  }),
);

export const vendorStorefrontSectionsRelations = relations(
  vendor_storefront_sections,
  ({ one }) => ({
    vendor: one(vendor, {
      fields: [vendor_storefront_sections.vendor_id],
      references: [vendor.id],
    }),
  }),
);

// ─── Navbar Relational Relations ──────────────────────────────────────────────

export const navMenusRelations = relations(nav_menus, ({ one, many }) => ({
  company: one(company, {
    fields: [nav_menus.company_id],
    references: [company.id],
  }),

  items: many(nav_items),
}));

export const navItemsRelations = relations(nav_items, ({ one, many }) => ({
  menu: one(nav_menus, {
    fields: [nav_items.menu_id],
    references: [nav_menus.id],
  }),

  parent: one(nav_items, {
    fields: [nav_items.parent_id],
    references: [nav_items.id],
    relationName: 'navItemChildren',
  }),

  children: many(nav_items, {
    relationName: 'navItemChildren',
  }),

  category: one(categories, {
    fields: [nav_items.category_id],
    references: [categories.id],
  }),
}));

export const siteMappingsRelations = relations(site_maps, ({ one }) => ({
  company: one(company, {
    fields: [site_maps.company_id],
    references: [company.id],
  }),
}));
