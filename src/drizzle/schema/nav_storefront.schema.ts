import * as pg from 'drizzle-orm/pg-core';
import { AnyPgColumn } from 'drizzle-orm/pg-core';
import { company, site_maps } from './main.schema';
import { categories } from './shop.schema';
import { sql } from 'drizzle-orm';
import { NavLayoutType } from '../types/types';

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

export enum NavItemType {
  CUSTOM_LINK = 'custom_link',
  CATEGORY = 'category',
}
export enum NavItemDisplayType {
  CATEGORY_LISTING = 'category_listing',
  DYNAMIC_SUBCATEGORIES = 'dynamic_subcategories',
  PRODUCT_RANGES = 'product_ranges',
  CATEGORY_DIRECTORY = 'category_directory',
  CATEGORY_LISTING_VISUAL = 'category_listing_visual',
}
export enum NavItemColType {
  SUBCATEGORIES = 'subcategories',
  BRANDS = 'brands',
  PROMOTION = 'promotion',
  PRODUCTS = 'products',
}
export enum NavMenuPosition {
  STICKY = 'sticky',
  RELATIVE = 'relative',
}
export enum NavMenuLogoAlignment {
  LEFT = 'left',
  CENTER = 'center',
}
export enum NavMenuType {
  SIMPLE = 'simple',
  MEGA = 'mega',
}

export const NavItemTypeEnum = pg.pgEnum('nav_item_type_enum', [
  NavItemType.CUSTOM_LINK,
  NavItemType.CATEGORY,
]);

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
// TABLE 2: nav_items  (9 columns + JSONB meta)
//
// Self-referential parent_id models the two-level L1 → L2 tree:
//   L1 item: parent_id IS NULL   — rendered as a top-level nav link
//   L2 item: parent_id = <L1 id> — rendered as a mega-menu column
//
// Only the columns that are used in WHERE / ORDER BY / JOIN are relational.
// Everything else (column headings, promo blocks, display modes) lives in
// the `meta` JSONB so it stays future-proof without migrations.
// ─────────────────────────────────────────────────────────────────────────────

export const NavLayoutTypeEnum = pg.pgEnum('nav_layout_type_enum', [
  NavLayoutType.NONE,
  NavLayoutType.DIRECTORY,
  NavLayoutType.GRID,
]);

export const nav_items = pg.pgTable(
  'nav_items',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),

    /**
     * FK to nav_menus.
     * CASCADE: deleting a menu purges all its items.
     * Indexed as part of composite indexes below — never needs a standalone
     * single-column index.
     */
    menu_id: pg
      .uuid('menu_id')
      .notNull()
      .references(() => nav_menus.id, { onDelete: 'cascade' }),

    /**
     * Self-referential FK.
     * NULL  → L1 item (top-level link in the navbar bar)
     * <id>  → L2 item (mega-menu column) under the referenced L1
     *
     * CASCADE: deleting an L1 item automatically removes all its L2 columns.
     */
    parent_id: pg
      .uuid('parent_id')
      .references((): AnyPgColumn => nav_items.id, { onDelete: 'cascade' }),

    /**
     * Display label.
     * varchar(120) — compact enough for index pages, generous for any label.
     * Used by the frontend to render both L1 nav links and L2 column headings.
     */
    label: pg.varchar('label', { length: 120 }).notNull(),

    /**
     * Target URL for this item.
     * text (unbounded) — CDN and category hrefs can be long.
     * For category items this is auto-populated server-side on write.
     */
    href: pg.text('href').notNull().default('/'),

    /**
     * Enum-typed: 'custom_link' | 'category'.
     * Used in the admin UI to filter and display the correct form fields.
     * Native pg enum → DB-level validation, fast equality comparisons.
     */
    item_type: NavItemTypeEnum('item_type')
      .notNull()
      .default(NavItemType.CUSTOM_LINK),

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

    /**
     * Rendering order within the same parent (L1 order in bar, L2 order
     * within a mega-menu panel).
     * smallint: range -32 768..32 767 — far more than any menu needs.
     * Saves 2 bytes vs. integer; produces narrower B-tree pages.
     */
    sort_order: pg.smallint('sort_order').notNull().default(0),

    /**
     * All type-specific, sparse configuration in one blob.
     * L1 fields: display_type, show_category_icons, parent_category_id
     * L2 fields: col_type, col_title, promo_*, icon_url
     *
     * None of these are ever filtered or sorted in SQL, so flat columns
     * would only add migration overhead.
     *
     * Type: NavItemMeta (see interface above).
     */
    meta: pg.jsonb('meta').$type<NavItemMeta>().notNull().default({}),

    /**
     * Root category FK — required when layout_type is DIRECTORY or GRID.
     * NULL when layout_type is NONE (standard link / legacy mega-menu).
     *
     * SET NULL on category deletion: the nav item gracefully degrades and
     * the CMS shows a warning to the vendor. No backend warning is logged
     * because ON DELETE SET NULL is an intentional, valid business state.
     * Indexed for fast reverse-lookup when categories are renamed/deleted.
     */
    root_category_id: pg
      .uuid('root_category_id')
      .references(() => categories.id, { onDelete: 'set null' }),

    layout_type: NavLayoutTypeEnum('layout_type')
      .notNull()
      .default(NavLayoutType.NONE),

    target_route: pg.varchar('target_route', { length: 60 }),

    created_at: pg.timestamp('created_at').notNull().defaultNow(),
    updated_at: pg
      .timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    /**
     * PRIMARY READ PATH — all items for a menu, ordered for rendering.
     * Covers: WHERE menu_id = ? ORDER BY sort_order
     * Including sort_order in the index lets Postgres skip a separate sort.
     */
    pg.index('idx_nav_items_menu_sort').on(t.menu_id, t.sort_order),

    /**
     * HIERARCHY SPLIT — fetch L1 items (parent_id IS NULL) or
     * L2 siblings (parent_id = <id>) for a given menu.
     * Covers: WHERE menu_id = ? AND parent_id IS NULL / = ?
     */
    pg.index('idx_nav_items_menu_parent').on(t.menu_id, t.parent_id),

    /**
     * PARTIAL INDEX (L1 only) — smallest possible index for L1-only scans.
     * Postgres auto-selects this when the predicate matches parent_id IS NULL.
     * Excludes all L2 rows → fewer pages to scan → faster cache utilisation.
     */
    pg
      .index('idx_nav_items_l1_only')
      .on(t.menu_id)
      .where(sql`${t.parent_id} IS NULL`),

    /**
     * CATEGORY FK INDEX — fast reverse-lookup when a category is renamed or
     * deleted so the service can locate and update/nullify affected items.
     */
    pg.index('idx_nav_items_category_id').on(t.category_id),

    /**
     * ROOT CATEGORY FK INDEX — fast reverse-lookup when the root category
     * of a DIRECTORY/GRID layout is deleted (ON DELETE SET NULL fires here).
     */
    pg.index('idx_nav_items_root_category_id').on(t.root_category_id),

    /**
     * Database-level CHECK constraint enforcing root_category_id requirements
     * based on layout_type selection.
     */
    pg.check(
      'layout_root_check',
      sql.raw(`(layout_type = '${NavLayoutType.NONE}' AND root_category_id IS NULL) OR (layout_type IN ('${NavLayoutType.DIRECTORY}', '${NavLayoutType.GRID}'))`),
    ),
  ],
);
