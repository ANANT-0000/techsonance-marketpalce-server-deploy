/**
 * Guard Error Keys — centralised error message strings for the
 * OrderEligibilityGuardService.  These are thrown as exception messages
 * and surfaced to the frontend via the API error body.
 *
 * Convention: Mirrors the ReturnsErrorKeyEnum pattern so callers can
 * distinguish machine-readable codes from human messages.
 */
export enum GuardErrorCode {
  // ── Lookup failures ────────────────────────────────────────────
  ORDER_ITEM_NOT_FOUND = 'ORDER_ITEM_NOT_FOUND',
  ORDER_NOT_FOUND = 'ORDER_NOT_FOUND',
  USER_MISMATCH = 'USER_MISMATCH',

  // ── SET / Final-Sale constraint ────────────────────────────────
  FINAL_SALE_BLOCKED = 'FINAL_SALE_BLOCKED',
  // Human message for FINAL_SALE_BLOCKED:
  // "This product is a Final Sale item and cannot be returned, replaced, or exchanged."

  // ── Status-based blocks ────────────────────────────────────────
  ITEM_NOT_DELIVERED = 'ITEM_NOT_DELIVERED',
  ITEM_NOT_CANCELLABLE_STATUS = 'ITEM_NOT_CANCELLABLE_STATUS',

  // ── Policy flag blocks ─────────────────────────────────────────
  RETURN_NOT_ALLOWED = 'RETURN_NOT_ALLOWED',
  REPLACEMENT_NOT_ALLOWED = 'REPLACEMENT_NOT_ALLOWED',
  EXCHANGE_NOT_ALLOWED = 'EXCHANGE_NOT_ALLOWED',

  // ── Time-window blocks ─────────────────────────────────────────
  RETURN_WINDOW_EXPIRED = 'RETURN_WINDOW_EXPIRED',
  REPLACEMENT_WINDOW_EXPIRED = 'REPLACEMENT_WINDOW_EXPIRED',

  // ── Duplicate request block ────────────────────────────────────
  DUPLICATE_REQUEST = 'DUPLICATE_REQUEST',

  // ── Internal / unexpected ──────────────────────────────────────
  GUARD_INTERNAL_ERROR = 'GUARD_INTERNAL_ERROR',
}

/**
 * Human-readable messages keyed by GuardErrorCode.
 * Used by both the backend (exception messages) and the frontend utility
 * (eligibilityResult.reason display).
 */
export const GUARD_ERROR_MESSAGES: Record<GuardErrorCode, string> = {
  [GuardErrorCode.ORDER_ITEM_NOT_FOUND]:
    'The order item could not be found.',
  [GuardErrorCode.ORDER_NOT_FOUND]:
    'The order associated with this item could not be found.',
  [GuardErrorCode.USER_MISMATCH]:
    'You are not authorised to perform this action on this order item.',

  [GuardErrorCode.FINAL_SALE_BLOCKED]:
    'This product is a Final Sale item. Returns, replacements, and exchanges are not permitted.',

  [GuardErrorCode.ITEM_NOT_DELIVERED]:
    'This action is only available for items that have been delivered.',
  [GuardErrorCode.ITEM_NOT_CANCELLABLE_STATUS]:
    'This item cannot be cancelled because it has already been shipped or delivered.',

  [GuardErrorCode.RETURN_NOT_ALLOWED]:
    'Returns are not enabled for this product. Please check the product policy.',
  [GuardErrorCode.REPLACEMENT_NOT_ALLOWED]:
    'Replacements are not enabled for this product. Please check the product policy.',
  [GuardErrorCode.EXCHANGE_NOT_ALLOWED]:
    'Exchanges are not enabled for this product. Please check the product policy.',

  [GuardErrorCode.RETURN_WINDOW_EXPIRED]:
    'The return window for this item has expired.',
  [GuardErrorCode.REPLACEMENT_WINDOW_EXPIRED]:
    'The replacement window for this item has expired.',

  [GuardErrorCode.DUPLICATE_REQUEST]:
    'A return or replacement request already exists for this item.',

  [GuardErrorCode.GUARD_INTERNAL_ERROR]:
    'An unexpected error occurred while checking eligibility. Please try again.',
};
