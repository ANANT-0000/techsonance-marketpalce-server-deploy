/**
 * Centralized error key registry for the Navbar module.
 * Using an enum (instead of raw strings) ensures:
 *  - All error keys are discovered via IDE autocomplete
 *  - Renaming a key causes a compile error at every call site
 *  - Log aggregation tools can group errors by enum value
 */
export enum NavbarErrorKeyEnum {
  // ── Company resolution ───────────────────────────────────────────────────
  FAILED_TO_RESOLVE_COMPANY = 'NAVBAR:FAILED_TO_RESOLVE_COMPANY',

  // ── nav_menus ────────────────────────────────────────────────────────────
  FAILED_TO_UPSERT_MENU    = 'NAVBAR:FAILED_TO_UPSERT_MENU',
  FAILED_TO_FETCH_MENU     = 'NAVBAR:FAILED_TO_FETCH_MENU',
  MENU_NOT_FOUND           = 'NAVBAR:MENU_NOT_FOUND',

  // ── nav_items — read ─────────────────────────────────────────────────────
  FAILED_TO_FETCH_ITEMS    = 'NAVBAR:FAILED_TO_FETCH_ITEMS',

  // ── nav_items — write ────────────────────────────────────────────────────
  FAILED_TO_CREATE_ITEM    = 'NAVBAR:FAILED_TO_CREATE_ITEM',
  FAILED_TO_UPDATE_ITEM    = 'NAVBAR:FAILED_TO_UPDATE_ITEM',
  FAILED_TO_DELETE_ITEM    = 'NAVBAR:FAILED_TO_DELETE_ITEM',
  FAILED_TO_REORDER_ITEMS  = 'NAVBAR:FAILED_TO_REORDER_ITEMS',

  // ── nav_items — guard checks ─────────────────────────────────────────────
  ITEM_NOT_FOUND            = 'NAVBAR:ITEM_NOT_FOUND',
  ITEM_MENU_MISMATCH        = 'NAVBAR:ITEM_MENU_MISMATCH',
  /** Raised when a caller tries to nest an L2 item under another L2 item. */
  INVALID_PARENT_DEPTH      = 'NAVBAR:INVALID_PARENT_DEPTH',
  /** Raised when has_mega_menu = true is set on an L2 item (not allowed). */
  MEGA_MENU_ON_CHILD_ITEM   = 'NAVBAR:MEGA_MENU_ON_CHILD_ITEM',
}
