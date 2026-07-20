import { ResetInterval } from '../../../drizzle/types/types.js';

/**
 * Describes the current counting window for a RATE feature.
 *
 * A "window" is the time-bounded period in which usage is accumulated before resetting.
 * This struct is used both to:
 * - Build the Redis key (`bucket`) for a given window, and
 * - Set the Redis TTL (`ttlSeconds`) so the key auto-expires when the window closes.
 */
export interface UsageWindow {
  /** UTC start of the current window period. */
  start: Date;
  /** UTC end (exclusive) of the current window period — the moment the counter should reset. */
  end: Date;
  /**
   * Stable, human-readable bucket identifier for the current window.
   * Used as a suffix in the Redis key (e.g. `usage:companyId:featureKey:h:2026-07-12T10`).
   * The bucket changes when the window rolls over, which effectively creates a fresh key
   * and resets the counter without any explicit delete operation.
   */
  bucket: string;
  /**
   * Time-to-live in **seconds** to set on the Redis key for this window.
   *
   * `0` is used for the `lifetime` bucket (COUNTER/GAUGE features with no reset).
   * In **cache-manager v5**, a TTL of `0` means **no expiry** — the key persists until
   * explicitly deleted. This is intentional for lifetime counters.
   *
   * ⚠️ If you ever upgrade `cache-manager` or switch Redis clients, re-verify this
   * behaviour — some older versions treat `0` as "expire immediately".
   */
  ttlSeconds: number;
}

/**
 * Resolves the current counting window for a RATE feature based on its reset interval.
 *
 * The returned `UsageWindow` contains:
 * - The `start` / `end` timestamps bounding the current window in UTC.
 * - A `bucket` string that is stable for the duration of the window and changes when
 *   the window rolls over (enabling zero-delete Redis key rotation).
 * - A `ttlSeconds` value for setting the Redis key TTL.
 *
 * ### `billing_cycle` is NOT handled here
 * The `BILLING_CYCLE` reset interval depends on each company's actual
 * `vendor_subscriptions.current_period_end`, which is not a fixed calendar interval.
 * Callers that need billing-cycle window resolution must use
 * `UsageTrackerService.getUsageWindow()` instead, which handles both calendar intervals
 * (via this function) and `BILLING_CYCLE` (via a DB lookup).
 *
 * Passing `ResetInterval.BILLING_CYCLE` here will fall through to the `default` case
 * and return a `lifetime` window — which is always wrong for billing-cycle features.
 *
 * @param interval — The reset interval for the feature, or `null` for COUNTER/GAUGE
 *                   features that never reset (lifetime window is returned).
 */
export function resolveWindow(interval: ResetInterval | null): UsageWindow {
  const now = new Date();

  switch (interval) {
    case ResetInterval.HOURLY: {
      const start = new Date(now);
      start.setUTCMinutes(0, 0, 0);
      const end = new Date(start);
      end.setUTCHours(end.getUTCHours() + 1);
      return {
        start,
        end,
        bucket: `h:${start.toISOString().slice(0, 13)}`,
        ttlSeconds: Math.ceil((end.getTime() - now.getTime()) / 1000),
      };
    }
    case ResetInterval.DAILY: {
      const start = new Date(now);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      return {
        start,
        end,
        bucket: `d:${start.toISOString().slice(0, 10)}`,
        ttlSeconds: Math.ceil((end.getTime() - now.getTime()) / 1000),
      };
    }
    case ResetInterval.MONTHLY: {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      return {
        start,
        end,
        bucket: `m:${start.toISOString().slice(0, 7)}`,
        ttlSeconds: Math.ceil((end.getTime() - now.getTime()) / 1000),
      };
    }
    default: {
      // COUNTER/GAUGE (or an unrecognised interval) — no reset, window is effectively "forever".
      // ttlSeconds = 0 → cache-manager v5 interprets 0 as "no expiry" (not "expire immediately").
      // ⚠️ Re-verify this if cache-manager or the Redis store adapter is ever upgraded.
      return {
        start: now,
        end: new Date('9999-12-31'),
        bucket: 'lifetime',
        ttlSeconds: 0,
      };
    }
  }
}

