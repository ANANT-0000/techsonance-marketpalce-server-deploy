import * as pg from 'drizzle-orm/pg-core';
import { AnyPgColumn } from 'drizzle-orm/pg-core';
import { company, site_maps } from './main.schema.js';
import { categories } from './shop.schema.js';
import { sql } from 'drizzle-orm';
import { NavLayoutType, NavItemType } from '../types/types.js';
import {
  NavItemColType,
  NavItemDisplayType,
  NavItemTypeEnum,
  NavLayoutTypeEnum,
  NavMenuLogoAlignment,
  NavMenuLinksAlignment,
  NavMenuPosition,
} from './enums.schema.js';

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN PHILOSOPHY — Lean Hybrid Schema
//
// The problem with flat-column schemas for UI config:
//   • Every new toggle = a migration + nullable column = sparse table
//   • Scalar settings (logo, shadow, search) are ALWAYS read together and
//     NEVER individually filtered or sorted in SQL — no index benefit.
//
// The solution: Hybrid Relational + JSONB
//   ┌─────────────────────────────────────────────────────────────────────┐
//   │  RELATIONAL (columns)         │  JSONB (settings / meta)            │
//   │  — Used in WHERE / ORDER BY   │  — Always read as a unit            │
//   │  — Joined across tables       │  — Never filtered in SQL            │
//   │  — Typed at DB level (enums)  │  — TypeScript interface enforces    │
//   │                               │    structure at app layer           │
//   ├───────────────────────────────┼─────────────────────────────────────┤
//   │  nav_menus.company_id (FK)    │  nav_menus.settings (logo, toggles) │
//   │  nav_items.menu_id    (FK)    │  nav_items.meta     (col cfg, promo)│
//   │  nav_items.parent_id  (self)  │                                     │
//   │  nav_items.category_id (FK)   │                                     │
//   │  nav_items.item_type  (enum)  │                                     │
//   │  nav_items.sort_order         │                                     │
//   │  nav_items.has_mega_menu      │                                     │
//   └───────────────────────────────┴─────────────────────────────────────┘
//
// Result: nav_menus shrinks from 16 columns → 5.
//         nav_items  shrinks from 20 columns → 9.
//         Zero loss of query performance. Zero JSON blobs in the tree.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Enums — only for values that are WHERE / JOIN targets ───────────────────

/**
 * L1 nav-item source type.
 * Used in WHERE clauses by the admin UI to filter category-linked items.
 */

/**
 * L1 nav-item source type.
 * Used in WHERE clauses by the admin UI to filter category-linked items.
 */

// ─────────────────────────────────────────────────────────────────────────────
// TypeScript interfaces for the JSONB columns.
// These are enforced by the service layer — not the DB — so they can evolve
// without a migration. Add new config fields here without touching the table.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scalar navbar settings stored as a single JSONB blob.
 * All settings here are always read together in one SELECT and never
 * filtered or sorted by individually, so flat columns add no value.
 *
 * Defaults applied by the service when a field is absent:
 *   logo_alignment  → 'LEFT'
 *   position        → 'STICKY'
 *   show_*          → true
 *   search_endpoint → '/store/search'
 */
export interface NavMenuSettings {
  // Logo
  logo_src?: string; // Cloudinary / CDN URL
  logo_alt?: string; // Image alt text (max 120 chars)
  logo_href?: string; // Wrapping link target, default '/'
  logo_alignment?: NavMenuLogoAlignment;
  links_alignment?: NavMenuLinksAlignment;

  // Behavior
  position?: NavMenuPosition;
  show_shadow?: boolean;
  show_border?: boolean;

  // Search bar
  search_visible?: boolean;
  search_placeholder?: string; // max 200 chars
  search_endpoint?: string;

  // Right-rail utility icons
  show_account?: boolean;
  show_wishlist?: boolean;
  show_cart?: boolean;

  // Announcement Bar
  announcement_visible?: boolean;
  announcement_items_left?: AnnouncementItem[];
  announcement_items_right?: AnnouncementItem[];
  announcement_bg_color?: string;
  announcement_text_color?: string;
  announcement_text_size?: string;
  announcement_mobile_alignment?: string;
}

export type AnnouncementItemType = "text" | "link" | "feature";
export type DeviceVisibility = "desktop" | "mobile";

export interface AnnouncementItem {
  id: string;
  type: AnnouncementItemType;
  label: string;
  target_route?: string;
  feature_key?: string;
  visible_on?: DeviceVisibility[];
  is_highlighted?: boolean;
}

/**
 * Per-item configuration stored as JSONB on nav_items.
 * Split by context:
 *   L1 (parent_id IS NULL) → display_type, show_category_icons, parent_category_id
 *   L2 (parent_id IS NOT NULL) → col_type, col_title, promo_*, icon_url
 *
 * Fields are sparse by design — only relevant keys are populated.
 */
export interface NavItemMeta {
  // ── L1 mega-menu data source ──────────────────────────────────────────────
  /**
   * Controls how the mega-menu columns for this L1 item are populated.
   * Only meaningful when has_mega_menu = true.
   */
  display_type?: NavItemDisplayType;
  route_key?: string;
  /**
   * Show thumbnail icons beside each category label.
   * Only used when display_type = 'CATEGORY_LISTING'.
   */
  show_category_icons?: boolean;

  /**
   * UUID of the parent category whose children auto-populate the mega-menu.
   * Only used when display_type = 'DYNAMIC_SUBCATEGORIES'.
   * Stored as a string here (no FK in JSONB) — service validates existence.
   */
  parent_category_id?: string;

  // ── L2 column config ──────────────────────────────────────────────────────
  /** Visual rendering type for this mega-menu column. */
  col_type?: NavItemColType;

  /** Column section heading text. Empty = no heading rendered. */
  col_title?: string;

  // ── L2 promotion block (col_type = 'PROMOTION') ───────────────────────────
  promo_image_url?: string;
  promo_title?: string; // max 160 chars
  promo_subtitle?: string; // max 300 chars
  promo_cta_href?: string;

  // ── Per-item icon (L2 SUBCATEGORIES / BRANDS) ─────────────────────────────
  /** Icon thumbnail URL shown alongside the link label. */
  icon_url?: string;
  product_ids?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// TABLE 1: nav_menus  (5 columns + JSONB settings)
//
// One row per company — enforced by UNIQUE on company_id.
// All scalar display settings live inside the `settings` JSONB so that
// adding a new toggle never requires a migration.
// ─────────────────────────────────────────────────────────────────────────────
export const nav_menus = pg.pgTable(
  'nav_menus',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),

    /**
     * FK to company.
     * CASCADE: deleting a company purges its navbar automatically.
     * UNIQUE enforced by index below: one navbar config per company.
     */
    company_id: pg
      .uuid('company_id')
      .notNull()
      .references(() => company.id, { onDelete: 'cascade' }),

    /**
     * All scalar navbar settings in one blob.
     * Default is an empty object — the service applies field-level defaults
     * (logo_alignment: 'LEFT', position: 'STICKY', show_*: true, etc.)
     * during reads so the client always receives a complete config.
     *
     * Type: NavMenuSettings (see interface above).
     */
    settings: pg
      .jsonb('settings')
      .$type<NavMenuSettings>()
      .notNull()
      .default({}),

    created_at: pg.timestamp('created_at').notNull().defaultNow(),
    updated_at: pg
      .timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    /**
     * Primary read path: one navbar per company.
     * UNIQUE enforces the business rule at DB level.
     * Also the only WHERE clause ever used against this table.
     */
    pg.uniqueIndex('uq_nav_menus_company_id').on(t.company_id),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// TABLE 2: nav_items (Global Catalog)
// ─────────────────────────────────────────────────────────────────────────────
export const nav_items = pg.pgTable('nav_items', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  kind: pg.varchar('kind', { length: 50 }).notNull(), // 'system_route' | 'dynamic_template'
  key: pg.varchar('key', { length: 100 }).notNull().unique(), // e.g., 'store', 'filtered_collection'
  label: pg.varchar('label', { length: 120 }).notNull(),
  path: pg.varchar('path', { length: 255 }), // e.g. '/store' (for system routes)
  template_key: pg.varchar('template_key', { length: 100 }), // e.g. 'category_link', 'custom_link', 'filtered_collection'
  config_schema: pg.jsonb('config_schema').default({}), // Describes what must be configured
  created_at: pg.timestamp('created_at').notNull().defaultNow(),
  updated_at: pg
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ─────────────────────────────────────────────────────────────────────────────
// TABLE 3: vendor_nav_links
//
// Links vendors' menus to global nav_items and stores configuration.
// ─────────────────────────────────────────────────────────────────────────────

export const vendor_nav_links = pg.pgTable(
  'vendor_nav_links',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),
    menu_id: pg
      .uuid('menu_id')
      .notNull()
      .references(() => nav_menus.id, { onDelete: 'cascade' }),

    parent_id: pg
      .uuid('parent_id')
      .references((): AnyPgColumn => vendor_nav_links.id, { onDelete: 'cascade' }),

    nav_item_id: pg
      .uuid('nav_item_id')
      .notNull()
      .references(() => nav_items.id, { onDelete: 'cascade' }),

    slug: pg.varchar('slug', { length: 150 }),
    config: pg.jsonb('config').default({}),

    label: pg.varchar('label', { length: 120 }).notNull(),

    /**
     * FK to categories.
     * Only populated when item_type = 'category'.
     * SET NULL on category deletion: the nav item degrades gracefully to a
     * dead link (vendor must explicitly fix it) rather than disappearing.
     * Indexed for fast reverse-lookup when category names change.
     */
    category_id: pg
      .uuid('category_id')
      .references(() => categories.id, { onDelete: 'set null' }),

    /**
     * Whether this L1 item opens a mega-menu panel on hover.
     * Stored as a column (not in JSONB) because the service and admin UI
     * filter on it: "fetch all L1 items that have a mega-menu".
     * Always false for L2 items (service enforces this).
     */
    has_mega_menu: pg.boolean('has_mega_menu').notNull().default(false),
    sort_order: pg.smallint('sort_order').notNull().default(0),
    meta: pg.jsonb('meta').$type<NavItemMeta>().notNull().default({}),

    root_category_id: pg
      .uuid('root_category_id')
      .references(() => categories.id, { onDelete: 'set null' }),

    layout_type: NavLayoutTypeEnum('layout_type')
      .notNull()
      .default(NavLayoutType.NONE),

    created_at: pg.timestamp('created_at').notNull().defaultNow(),
    updated_at: pg
      .timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    pg.index('idx_vendor_nav_links_menu_sort').on(t.menu_id, t.sort_order),
    pg.index('idx_vendor_nav_links_menu_parent').on(t.menu_id, t.parent_id),
    pg.index('idx_vendor_nav_links_l1_only').on(t.menu_id).where(sql`${t.parent_id} IS NULL`),
    pg.index('idx_vendor_nav_links_root_category_id').on(t.root_category_id),
    pg.check(
      'layout_root_check',
      sql.raw(
        `(layout_type = '${NavLayoutType.NONE}' AND root_category_id IS NULL) OR (layout_type IN ('${NavLayoutType.DIRECTORY}', '${NavLayoutType.GRID}'))`,
      ),
    ),
  ],
);
