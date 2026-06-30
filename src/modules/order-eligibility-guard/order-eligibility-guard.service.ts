import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import {
  order_items,
  orders,
  order_item_policy,
  return_requests,
} from '../../drizzle/schema';
import { OrderStatus } from '../../drizzle/types/types';
import {
  GuardErrorCode,
  GUARD_ERROR_MESSAGES,
} from './constants/guard-error.enum';
import { GuardInput, GuardOperation } from './dto/guard-input.dto';
import {
  GuardResult,
  PolicySnapshot,
  GuardOrderItem,
} from './dto/guard-result.dto';

// ─── SET-constraint policy types ─────────────────────────────────────────────
// Products under these policy types are Final Sale.
// Returns, replacements and exchanges are ALWAYS blocked regardless of flags.
const FINAL_SALE_POLICY_TYPES = new Set(['no_return', 'none']);

// ─── Order statuses that allow CANCELLATION ───────────────────────────────────
const CANCELLABLE_STATUSES = new Set<OrderStatus>([
  OrderStatus.PENDING,
  OrderStatus.PROCESSING,
]);

// ─── Order statuses that allow post-delivery operations ───────────────────────
const POST_DELIVERY_REQUIRED_STATUSES = new Set<OrderStatus>([
  OrderStatus.DELIVERED,
]);

@Injectable()
export class OrderEligibilityGuardService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleService) {}

  // ════════════════════════════════════════════════════════════════════════════
  // PUBLIC API — the single entry point for all guard checks
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * assertEligible()
   *
   * Throws a NestJS HTTP exception immediately when any guard rule fails.
   * Never returns a "failed" result — callers can safely assume the operation
   * is allowed when this method completes without throwing.
   *
   * @throws NotFoundException      — item / order not found
   * @throws ForbiddenException     — SET constraint (Final Sale) or user mismatch
   * @throws BadRequestException    — status check, policy flag, time window, duplicate
   * @throws InternalServerErrorException — unexpected DB error
   */
  async assertEligible(input: GuardInput): Promise<GuardResult> {
    try {
      // ── 1. Fetch order item + parent order in one join ──────────────────
      const orderItem = await this._fetchOrderItem(input.orderItemId);

      // ── 2. Ownership check — does this item belong to the requesting user? ─
      this._assertOwnership(orderItem, input.userId);

      // ── 3. Fetch the policy snapshot (may be null for legacy orders) ────
      const policy = await this._fetchPolicySnapshot(input.orderItemId);

      // ── 4. Duplicate request check (for post-delivery operations) ───────
      if (input.operation !== GuardOperation.CANCELLATION) {
        await this._assertNoDuplicateRequest(input.orderItemId);
      }

      // ── 5. Run operation-specific rules ─────────────────────────────────
      switch (input.operation) {
        case GuardOperation.RETURN:
          this._assertReturnEligible(orderItem, policy);
          break;
        case GuardOperation.REPLACEMENT:
          this._assertReplacementEligible(orderItem, policy);
          break;
        case GuardOperation.EXCHANGE:
          // Exchange uses the same rules as replacement (same DB type)
          this._assertReplacementEligible(orderItem, policy);
          break;
        case GuardOperation.CANCELLATION:
          this._assertCancellationEligible(orderItem);
          break;
      }

      // ── 6. All rules passed — return the resolved data ──────────────────
      const result = new GuardResult();
      result.orderItem = orderItem;
      result.policy = policy;
      return result;
    } catch (error) {
      // Re-throw known NestJS HTTP exceptions as-is
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      // Wrap unknown errors
      throw new InternalServerErrorException(
        GUARD_ERROR_MESSAGES[GuardErrorCode.GUARD_INTERNAL_ERROR],
        { cause: error },
      );
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PRIVATE — rule implementations
  // ════════════════════════════════════════════════════════════════════════════

  // ── Rule: RETURN ─────────────────────────────────────────────────────────
  private _assertReturnEligible(
    item: GuardOrderItem,
    policy: PolicySnapshot | null,
  ): void {
    // Must be delivered
    if (!POST_DELIVERY_REQUIRED_STATUSES.has(item.order_status)) {
      throw new BadRequestException(
        GUARD_ERROR_MESSAGES[GuardErrorCode.ITEM_NOT_DELIVERED],
        { description: GuardErrorCode.ITEM_NOT_DELIVERED },
      );
    }

    // SET constraint — Final Sale hard block
    if (policy && FINAL_SALE_POLICY_TYPES.has(policy.policy_type)) {
      throw new ForbiddenException(
        GUARD_ERROR_MESSAGES[GuardErrorCode.FINAL_SALE_BLOCKED],
        { description: GuardErrorCode.FINAL_SALE_BLOCKED },
      );
    }

    // Also block if return_replace_mode explicitly says 'none'
    if (policy && policy.return_replace_mode === 'none') {
      throw new ForbiddenException(
        GUARD_ERROR_MESSAGES[GuardErrorCode.FINAL_SALE_BLOCKED],
        { description: GuardErrorCode.FINAL_SALE_BLOCKED },
      );
    }

    // Policy flag check
    if (policy && !policy.is_returnable) {
      throw new BadRequestException(
        GUARD_ERROR_MESSAGES[GuardErrorCode.RETURN_NOT_ALLOWED],
        { description: GuardErrorCode.RETURN_NOT_ALLOWED },
      );
    }

    // Time-window check
    if (policy?.return_window_days && policy.return_window_days > 0) {
      const referenceDate = item.delivered_at ?? item.created_at;
      const daysSince = this._daysSince(referenceDate);
      if (daysSince > policy.return_window_days) {
        throw new BadRequestException(
          `${GUARD_ERROR_MESSAGES[GuardErrorCode.RETURN_WINDOW_EXPIRED]} ` +
            `(Window: ${policy.return_window_days} days, Elapsed: ${daysSince} days)`,
          { description: GuardErrorCode.RETURN_WINDOW_EXPIRED },
        );
      }
    }
  }

  // ── Rule: REPLACEMENT / EXCHANGE ────────────────────────────────────────
  private _assertReplacementEligible(
    item: GuardOrderItem,
    policy: PolicySnapshot | null,
  ): void {
    // Must be delivered
    if (!POST_DELIVERY_REQUIRED_STATUSES.has(item.order_status)) {
      throw new BadRequestException(
        GUARD_ERROR_MESSAGES[GuardErrorCode.ITEM_NOT_DELIVERED],
        { description: GuardErrorCode.ITEM_NOT_DELIVERED },
      );
    }

    // SET constraint — Final Sale hard block
    if (policy && FINAL_SALE_POLICY_TYPES.has(policy.policy_type)) {
      throw new ForbiddenException(
        GUARD_ERROR_MESSAGES[GuardErrorCode.FINAL_SALE_BLOCKED],
        { description: GuardErrorCode.FINAL_SALE_BLOCKED },
      );
    }

    if (policy && policy.return_replace_mode === 'none') {
      throw new ForbiddenException(
        GUARD_ERROR_MESSAGES[GuardErrorCode.FINAL_SALE_BLOCKED],
        { description: GuardErrorCode.FINAL_SALE_BLOCKED },
      );
    }

    // Policy flag check
    if (policy && !policy.is_replaceable) {
      throw new BadRequestException(
        GUARD_ERROR_MESSAGES[GuardErrorCode.REPLACEMENT_NOT_ALLOWED],
        { description: GuardErrorCode.REPLACEMENT_NOT_ALLOWED },
      );
    }

    // Time-window check
    if (
      policy?.replacement_window_days &&
      policy.replacement_window_days > 0
    ) {
      const referenceDate = item.delivered_at ?? item.created_at;
      const daysSince = this._daysSince(referenceDate);
      if (daysSince > policy.replacement_window_days) {
        throw new BadRequestException(
          `${GUARD_ERROR_MESSAGES[GuardErrorCode.REPLACEMENT_WINDOW_EXPIRED]} ` +
            `(Window: ${policy.replacement_window_days} days, Elapsed: ${daysSince} days)`,
          { description: GuardErrorCode.REPLACEMENT_WINDOW_EXPIRED },
        );
      }
    }
  }

  // ── Rule: CANCELLATION ──────────────────────────────────────────────────
  private _assertCancellationEligible(item: GuardOrderItem): void {
    if (!CANCELLABLE_STATUSES.has(item.order_status)) {
      throw new BadRequestException(
        `${GUARD_ERROR_MESSAGES[GuardErrorCode.ITEM_NOT_CANCELLABLE_STATUS]} ` +
          `Current status: ${item.order_status}.`,
        { description: GuardErrorCode.ITEM_NOT_CANCELLABLE_STATUS },
      );
    }
    // Note: No policy-flag check for cancellation — it is purely status-driven.
    // If a vendor-configurable cancellation window is added in future, extend here.
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PRIVATE — DB helpers
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Fetches the order item joined with its parent order so we have
   * user_id, created_at, and order_status in one query.
   */
  private async _fetchOrderItem(orderItemId: string): Promise<GuardOrderItem> {
    const rows = await this.db
      .select({
        id: order_items.id,
        order_id: order_items.order_id,
        user_id: orders.user_id,
        product_variant_id: order_items.product_variant_id,
        order_status: order_items.order_status,
        quantity: order_items.quantity,
        price: order_items.price,
        company_id: order_items.company_id,
        created_at: orders.created_at, // order placement date
      })
      .from(order_items)
      .leftJoin(orders, eq(order_items.order_id, orders.id))
      .where(eq(order_items.id, orderItemId))
      .limit(1)
      .catch((err) => {
        throw new InternalServerErrorException(
          GUARD_ERROR_MESSAGES[GuardErrorCode.GUARD_INTERNAL_ERROR],
          { cause: err },
        );
      });

    if (!rows.length || !rows[0].order_id) {
      throw new NotFoundException(
        GUARD_ERROR_MESSAGES[GuardErrorCode.ORDER_ITEM_NOT_FOUND],
        { description: GuardErrorCode.ORDER_ITEM_NOT_FOUND },
      );
    }

    const row = rows[0];
    return {
      id: row.id,
      order_id: row.order_id,
      user_id: row.user_id,
      product_variant_id: row.product_variant_id ?? '',
      order_status: row.order_status,
      quantity: row.quantity,
      price: row.price,
      company_id: row.company_id,
      created_at: row.created_at ? new Date(row.created_at) : new Date(),
      delivered_at: null,
    } as GuardOrderItem;
  }

  /**
   * Fetches the policy snapshot from order_item_policy for this order item.
   * Returns null if no snapshot exists (legacy orders or no policy assigned).
   */
  private async _fetchPolicySnapshot(
    orderItemId: string,
  ): Promise<PolicySnapshot | null> {
    const rows = await this.db
      .select({
        policy_snapshot: order_item_policy.policy_snapshot,
      })
      .from(order_item_policy)
      .where(eq(order_item_policy.order_item_id, orderItemId))
      .limit(1)
      .catch(() => [] as { policy_snapshot: unknown }[]);

    if (!rows.length || !rows[0].policy_snapshot) return null;

    const snap = rows[0].policy_snapshot as Record<string, unknown>;

    return {
      policy_id: (snap.policy_id as string) ?? '',
      policy_name: (snap.policy_name as string) ?? '',
      policy_type: (snap.policy_type as string) ?? 'none',
      is_returnable: Boolean(snap.is_returnable),
      is_replaceable: Boolean(snap.is_replaceable),
      return_window_days: (snap.return_window_days as number | null) ?? null,
      replacement_window_days:
        (snap.replacement_window_days as number | null) ?? null,
      return_replace_mode: (snap.return_replace_mode as PolicySnapshot['return_replace_mode']) ?? 'none',
    };
  }

  /** Throws ForbiddenException if the order item does not belong to userId */
  private _assertOwnership(item: GuardOrderItem, userId: string): void {
    if (item.user_id && item.user_id !== userId) {
      throw new ForbiddenException(
        GUARD_ERROR_MESSAGES[GuardErrorCode.USER_MISMATCH],
        { description: GuardErrorCode.USER_MISMATCH },
      );
    }
  }

  /** Throws BadRequestException if an open return/replacement request exists */
  private async _assertNoDuplicateRequest(
    orderItemId: string,
  ): Promise<void> {
    const existing = await this.db
      .select({ id: return_requests.id })
      .from(return_requests)
      .where(eq(return_requests.order_item_id, orderItemId))
      .limit(1)
      .catch(() => []);

    if (existing.length > 0) {
      throw new BadRequestException(
        GUARD_ERROR_MESSAGES[GuardErrorCode.DUPLICATE_REQUEST],
        { description: GuardErrorCode.DUPLICATE_REQUEST },
      );
    }
  }

  /** Returns the number of whole days elapsed since a reference date */
  private _daysSince(date: Date): number {
    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.floor((Date.now() - new Date(date).getTime()) / msPerDay);
  }
}
