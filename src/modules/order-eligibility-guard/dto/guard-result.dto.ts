import { OrderStatus } from '../../../drizzle/types/types.js';

/**
 * Snapshot of the resolved policy fields needed by the guard.
 * Sourced from order_item_policy.policy_snapshot (JSONB) so it represents
 * the policy at the time of purchase — immutable after order placement.
 */
export interface PolicySnapshot {
  policy_id: string;
  policy_name: string;
  policy_type: string; // e.g. 'warranty' | 'no_return' | 'none' | ...
  is_returnable: boolean;
  is_replaceable: boolean;
  return_window_days: number | null;
  replacement_window_days: number | null;
  return_replace_mode: 'none' | 'return_only' | 'replace_only' | 'both';
}

/**
 * The resolved order item data the guard needs.
 */
export interface GuardOrderItem {
  id: string;
  order_id: string;
  user_id: string | null; // from orders.user_id via join
  product_variant_id: string;
  order_status: OrderStatus;
  quantity: number;
  price: string;
  company_id: string | null;
  created_at: Date; // order placed date — used for cancellation window
  delivered_at: Date | null; // delivery date — used for return/replacement window
}

/**
 * The value returned by assertEligible() on success.
 * Callers (ReturnsService, OrdersService) can use this to avoid re-fetching
 * the same data they already have from the guard.
 */
export class GuardResult {
  /** Always true — assertEligible() throws on failure, never returns false */
  eligible: true = true;

  /** Resolved order item row — ready to use in the calling service */
  orderItem!: GuardOrderItem;

  /**
   * Resolved policy snapshot from order_item_policy.
   * Null if no policy was recorded at time of purchase (e.g. old orders
   * created before the policy system existed).
   */
  policy: PolicySnapshot | null = null;
}
