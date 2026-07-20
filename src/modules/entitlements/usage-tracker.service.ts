import { Injectable, Logger, Inject } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { type DrizzleService, DRIZZLE } from '../../drizzle/drizzle.module.js';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import {
  feature_definitions,
  feature_usage,
  vendor_subscriptions,
  plan_feature_limits,
} from '../../drizzle/schema/subscription.schema.js';
import {
  EnforcementMode,
  FeatureValueType,
  ResetInterval,
} from '../../drizzle/types/types.js';
import { resolveWindow, type UsageWindow } from './utils/window.util.js';

/**
 * Tracks and persists feature usage for quota enforcement.
 *
 * ## Storage strategy
 * Usage is stored in one of two places depending on the feature's `value_type`:
 *
 * | `value_type`       | Storage  | Rationale |
 * |--------------------|----------|-----------|
 * | `RATE`             | Redis    | High-frequency; windowed; eventual durability acceptable. |
 * | `COUNTER` / `GAUGE`| Postgres | Billing-critical; must be durable and accurate. |
 *
 * ### Redis path (RATE)
 * Usage is incremented in Redis with a TTL matching the reset window. On Redis failure,
 * the service falls back to Postgres so quota enforcement degrades gracefully.
 * Every successful Redis write also triggers a **fire-and-forget** flush to Postgres for
 * reporting dashboards — this flush must never block or gate the request.
 *
 * ### Postgres path (COUNTER / GAUGE)
 * Usage is upserted atomically using `ON CONFLICT DO UPDATE`. The DB schema enforces a
 * non-negative check constraint (`chk_usage_non_negative`) as the final safety backstop.
 *
 * ## Key operations
 * - `getCurrentUsage()` — read-only quota read.
 * - `increment()` — consume quota (increases usage by `amount`).
 * - `decrement()` — release quota for COUNTER/GAUGE; **no-op for RATE** (windows self-reset).
 */
@Injectable()
export class UsageTrackerService {
  private readonly logger = new Logger(UsageTrackerService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /**
   * Fetches the `feature_definitions` row for a given feature key.
   * Throws if the key is not found — unknown keys indicate a misconfiguration that
   * must be fixed in `feature_definitions` before any quota logic can run.
   *
   * @param featureKey — the string key (e.g. `'max_products'`).
   * @throws {Error} if no matching `feature_definitions` row exists.
   */
  async getFeatureDefinition(featureKey: string) {
    const def = await this.db.query.feature_definitions.findFirst({
      where: eq(feature_definitions.feature_key, featureKey),
    });
    if (!def) {
      throw new Error(
        `Unknown feature_key "${featureKey}" — add it to feature_definitions first.`,
      );
    }
    return def;
  }

  /**
   * Fetches the `plan_feature_limits` row for the company's active plan and the given
   * feature. Returns `null` if the company has no subscription or the plan does not
   * configure this feature.
   *
   * **Prefer passing `hintResetInterval`** to `getCurrentUsage()` / `increment()` when
   * the caller already holds a resolved `EntitlementMap` — that avoids this extra DB
   * round-trip entirely.
   *
   * @param companyId — UUID of the company.
   * @param featureId — UUID of the feature definition row.
   */
  async getPlanFeatureLimit(companyId: string, featureId: string) {
    const sub = await this.db.query.vendor_subscriptions.findFirst({
      where: eq(vendor_subscriptions.company_id, companyId),
    });
    if (!sub) return null;
    return this.db.query.plan_feature_limits.findFirst({
      where: and(
        eq(plan_feature_limits.plan_id, sub.plan_id),
        eq(plan_feature_limits.feature_id, featureId),
      ),
    });
  }

  /**
   * Returns the company's current usage count for the given feature in the active window.
   *
   * - For `RATE` features: reads from Redis (current window bucket).
   * - For `COUNTER` / `GAUGE` features: reads from Postgres.
   *
   * @param companyId         — UUID of the company.
   * @param featureKey        — the feature's string key.
   * @param hintResetInterval — optional reset interval, passed by callers that already
   *                            hold the resolved `EntitlementMap`. Skips the internal
   *                            `getPlanFeatureLimit` DB query when provided.
   */
  async getCurrentUsage(
    companyId: string,
    featureKey: string,
    hintResetInterval?: ResetInterval | null,
  ): Promise<number> {
    const feature = await this.getFeatureDefinition(featureKey);

    if (feature.value_type === FeatureValueType.RATE) {
      const resetInterval =
        hintResetInterval !== undefined
          ? hintResetInterval
          : ((await this.getPlanFeatureLimit(companyId, feature.id))
              ?.reset_interval as ResetInterval | null);
      return this.readRedisUsage(companyId, feature, resetInterval ?? null);
    }
    return this.readPostgresUsage(companyId, feature.id);
  }

  /**
   * Increments the company's usage for the given feature by `amount` and returns the
   * new total.
   *
   * - For `RATE` features: increments in Redis + fire-and-forget Postgres flush.
   * - For `COUNTER` / `GAUGE` features: increments in Postgres atomically.
   *
   * @param companyId         — UUID of the company.
   * @param featureKey        — the feature's string key.
   * @param amount            — units to consume (default: 1).
   * @param hintResetInterval — optional reset interval from the caller's `EntitlementMap`,
   *                            avoiding an extra `getPlanFeatureLimit` DB query.
   * @returns the new usage total after incrementing.
   */
  async increment(
    companyId: string,
    featureKey: string,
    amount = 1,
    hintResetInterval?: ResetInterval | null,
  ): Promise<number> {
    const feature = await this.getFeatureDefinition(featureKey);

    if (feature.value_type === FeatureValueType.RATE) {
      const resetInterval =
        hintResetInterval !== undefined
          ? hintResetInterval
          : ((await this.getPlanFeatureLimit(companyId, feature.id))
              ?.reset_interval as ResetInterval | null);
      return this.incrementViaRedis(
        companyId,
        feature,
        amount,
        resetInterval ?? null,
      );
    }
    return this.incrementViaPostgres(companyId, feature.id, amount);
  }

  /**
   * Atomically checks if `used_value + amount <= limit` and increments if true.
   * Succeeds unconditionally for `soft` enforcement.
   * Used exclusively for `COUNTER` / `GAUGE` features.
   */
  async checkAndIncrement(
    companyId: string,
    featureKey: string,
    limit: number,
    enforcementMode: EnforcementMode,
    amount = 1,
    hintResetInterval?: ResetInterval | null,
  ): Promise<number | false> {
    const feature = await this.getFeatureDefinition(featureKey);

    if (enforcementMode === 'hard' && amount > limit) {
      return false;
    }

    const [rows] = await this.db
      .insert(feature_usage)
      .values({
        company_id: companyId,
        feature_id: feature.id,
        used_value: amount,
        window_start: null,
        window_end: null,
      })
      .onConflictDoUpdate({
        target: [feature_usage.company_id, feature_usage.feature_id],
        set: {
          used_value: sql`${feature_usage.used_value} + ${amount}`,
          updated_at: new Date(),
        },
        where:
          enforcementMode === EnforcementMode.HARD
            ? sql`${feature_usage.used_value} + ${amount} <= ${limit}`
            : undefined,
      })
      .returning({ used_value: feature_usage.used_value });

    if (rows === null) {
      return false; // Denied by condition
    }
    return rows.used_value;
  }

  /**
   * Decrements the company's usage for the given feature by `amount`.
   *
   * **Only applicable to `COUNTER` / `GAUGE` features** (e.g. freeing a seat, deleting a
   * product). For `RATE` features this is intentionally a **no-op** — rate-limit windows
   * represent consumption within a fixed time period, not a refillable resource pool.
   * The counter resets automatically when the window expires.
   *
   * The underlying SQL uses `GREATEST(0, used_value - amount)` to prevent the value going
   * negative, in addition to the DB-level `CHECK` constraint.
   *
   * @param companyId  — UUID of the company.
   * @param featureKey — the feature's string key.
   * @param amount     — units to release (default: 1).
   */
  async decrement(
    companyId: string,
    featureKey: string,
    amount = 1,
  ): Promise<void> {
    const feature = await this.getFeatureDefinition(featureKey);

    if (feature.value_type === FeatureValueType.RATE) {
      // Rate-limit windows self-reset — decrement has no meaningful effect.
      // Log a debug warning so callers that mistakenly call decrement on a RATE
      // feature get visibility in development logs.
      this.logger.debug(
        `decrement() is a no-op for RATE feature "${featureKey}" (company ${companyId}). ` +
          `Rate windows self-reset; there is nothing to release.`,
      );
      return;
    }

    await this.db
      .update(feature_usage)
      .set({
        // GREATEST avoids relying on the DB to reject an already-wrong write;
        // the CHECK constraint (chk_usage_non_negative) is the real floor.
        used_value: sql`GREATEST(0, ${feature_usage.used_value} - ${amount})`,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(feature_usage.company_id, companyId),
          eq(feature_usage.feature_id, feature.id),
        ),
      );
  }

  // ---------------------------------------------------------------
  // Postgres path — COUNTER / GAUGE (billing-relevant, must be durable)
  // ---------------------------------------------------------------

  /**
   * Reads the current `used_value` for a COUNTER/GAUGE feature directly from Postgres.
   * Returns 0 if no usage row exists yet (i.e. the company has never consumed this feature).
   */
  private async readPostgresUsage(
    companyId: string,
    featureId: string,
  ): Promise<number> {
    const row = await this.db.query.feature_usage.findFirst({
      where: and(
        eq(feature_usage.company_id, companyId),
        eq(feature_usage.feature_id, featureId),
      ),
    });
    return row?.used_value ?? 0;
  }

  /**
   * Atomically increments the COUNTER/GAUGE usage in Postgres using an upsert.
   * On conflict (row already exists), adds `amount` to the existing `used_value`.
   *
   * @returns the updated `used_value` after the increment.
   */
  private async incrementViaPostgres(
    companyId: string,
    featureId: string,
    amount: number,
  ): Promise<number> {
    const [row] = await this.db
      .insert(feature_usage)
      .values({
        company_id: companyId,
        feature_id: featureId,
        used_value: amount,
        window_start: null,
        window_end: null,
      })
      .onConflictDoUpdate({
        target: [feature_usage.company_id, feature_usage.feature_id],
        set: {
          used_value: sql`${feature_usage.used_value} + ${amount}`,
          updated_at: new Date(),
        },
      })
      .returning({ used_value: feature_usage.used_value });

    return row.used_value;
  }

  // ---------------------------------------------------------------
  // Redis path — RATE (high frequency, windowed, tolerant of eventual durability)
  // ---------------------------------------------------------------

  /**
   * Builds the Redis key for a rate-limited feature's usage counter.
   * Format: `usage:{companyId}:{featureKey}:{bucket}`
   * The `bucket` segment changes when the window rolls over, creating a fresh key
   * (and therefore a reset counter) without any explicit delete operation.
   */
  private redisKey(
    companyId: string,
    featureKey: string,
    bucket: string,
  ): string {
    return `usage:${companyId}:${featureKey}:${bucket}`;
  }

  /**
   * Resolves the correct `UsageWindow` for a company + reset interval combination.
   *
   * For all calendar-based intervals (`HOURLY`, `DAILY`, `MONTHLY`), delegates to the
   * pure `resolveWindow()` utility which works without a DB call.
   *
   * For `BILLING_CYCLE`, fetches the company's actual `current_period_start` /
   * `current_period_end` from `vendor_subscriptions` — billing periods are anchored to the
   * subscription start date, not to calendar month boundaries.
   *
   * `null` (COUNTER/GAUGE — lifetime) also delegates to `resolveWindow()` which returns
   * the `lifetime` bucket with no TTL.
   *
   * @param companyId     — UUID of the company (only used for `BILLING_CYCLE` lookups).
   * @param resetInterval — the feature's reset interval, or `null` for lifetime features.
   */
  private async getUsageWindow(
    companyId: string,
    resetInterval: ResetInterval | null,
  ): Promise<UsageWindow> {
    if (resetInterval === ResetInterval.BILLING_CYCLE) {
      const billingCycle = await this.resolveBillingCycleWindow(companyId);
      const now = new Date();
      return {
        start: billingCycle.start,
        end: billingCycle.end,
        bucket: `billing:${billingCycle.start.toISOString().slice(0, 10)}`,
        ttlSeconds: Math.ceil(
          (billingCycle.end.getTime() - now.getTime()) / 1000,
        ),
      };
    }
    return resolveWindow(resetInterval);
  }

  /**
   * Reads the current usage count for a RATE feature from Redis.
   *
   * Uses `getUsageWindow()` (not `resolveWindow()` directly) to ensure that
   * `BILLING_CYCLE` features use the correct company-specific window bucket.
   *
   * On Redis error, falls back to the Postgres `feature_usage` table so quota reads
   * degrade gracefully without throwing to the caller.
   */
  private async readRedisUsage(
    companyId: string,
    feature: typeof feature_definitions.$inferSelect,
    resetInterval: ResetInterval | null,
  ): Promise<number> {
    // ✅ Bug #1 fix: use getUsageWindow() so BILLING_CYCLE resolves against the
    //    company's actual subscription period, not the lifetime bucket.
    const window = await this.getUsageWindow(companyId, resetInterval);
    try {
      const value = await this.cache.get<string>(
        this.redisKey(companyId, feature.feature_key, window.bucket),
      );
      return value ? parseInt(value, 10) : 0;
    } catch (err) {
      this.logger.warn(
        `Redis unavailable reading usage for ${feature.feature_key}, falling back to Postgres`,
        err as Error,
      );
      return this.readPostgresUsage(companyId, feature.id);
    }
  }

  /**
   * Increments the usage counter for a RATE feature in Redis and returns the new total.
   *
   * Uses `getUsageWindow()` (not `resolveWindow()` directly) to ensure that
   * `BILLING_CYCLE` features use the correct company-specific window bucket.
   *
   * After updating Redis, triggers `flushToPostgresAsync()` for durability (fire-and-forget).
   * On Redis error, falls back to incrementing in Postgres.
   */
  private async incrementViaRedis(
    companyId: string,
    feature: typeof feature_definitions.$inferSelect,
    amount: number,
    resetInterval: ResetInterval | null,
  ): Promise<number> {
    // ✅ Bug #1 fix: use getUsageWindow() so BILLING_CYCLE resolves against the
    //    company's actual subscription period, not the lifetime bucket.
    const window = await this.getUsageWindow(companyId, resetInterval);
    const key = this.redisKey(companyId, feature.feature_key, window.bucket);

    try {
      const currentValueStr = await this.cache.get<string>(key);
      const currentValue = currentValueStr ? parseInt(currentValueStr, 10) : 0;
      const newValue = currentValue + amount;

      // TTL in milliseconds for cache-manager
      await this.cache.set(key, newValue.toString(), window.ttlSeconds * 1000);

      // Best-effort durability flush for reporting dashboards.
      // This must never block or gate the request — fire-and-forget only.
      this.flushToPostgresAsync(
        companyId,
        feature.id,
        newValue,
        window.start,
        window.end,
      );
      return newValue;
    } catch (err) {
      this.logger.warn(
        `Redis unavailable incrementing usage for ${feature.feature_key}, falling back to Postgres`,
        err as Error,
      );
      const [row] = await this.db
        .insert(feature_usage)
        .values({
          company_id: companyId,
          feature_id: feature.id,
          used_value: amount,
          window_start: window.start,
          window_end: window.end,
        })
        .onConflictDoUpdate({
          target: [feature_usage.company_id, feature_usage.feature_id],
          set: {
            used_value: sql`CASE 
              WHEN ${feature_usage.window_start} IS DISTINCT FROM ${window.start} THEN ${amount} 
              ELSE ${feature_usage.used_value} + ${amount} 
            END`,
            window_start: window.start,
            window_end: window.end,
            updated_at: new Date(),
          },
        })
        .returning({ used_value: feature_usage.used_value });

      return row.used_value;
    }
  }

  /**
   * Writes the current Redis usage total to `feature_usage` in Postgres as a
   * best-effort durability mirror for reporting dashboards.
   *
   * **This must be fire-and-forget** — it must never block or throw to the caller.
   * Errors are logged but swallowed.
   *
   * ### Why `GREATEST` on conflict?
   * Multiple in-flight requests may flush concurrently. Using `GREATEST(stored, incoming)`
   * ensures a delayed (stale) flush cannot roll back a more recent value written by a
   * concurrent flush. Redis remains the authoritative source of truth for the window.
   *
   * @param value       — the current Redis total (absolute, not a delta).
   * @param windowStart — start of the current counting window.
   * @param windowEnd   — end of the current counting window.
   */
  private flushToPostgresAsync(
    companyId: string,
    featureId: string,
    value: number,
    windowStart: Date,
    windowEnd: Date,
  ): void {
    this.db
      .insert(feature_usage)
      .values({
        company_id: companyId,
        feature_id: featureId,
        used_value: value,
        window_start: windowStart,
        window_end: windowEnd,
      })
      .onConflictDoUpdate({
        target: [feature_usage.company_id, feature_usage.feature_id],
        set: {
          // ✅ GREATEST prevents a stale concurrent flush from overwriting
          //    a more recent value. Redis is authoritative; Postgres is the mirror.
          used_value: sql`CASE 
            WHEN ${feature_usage.window_start} IS DISTINCT FROM ${windowStart} THEN ${value} 
            ELSE GREATEST(${feature_usage.used_value}, ${value}) 
          END`,
          window_start: windowStart,
          window_end: windowEnd,
          updated_at: new Date(),
        },
      })
      .catch((err) =>
        this.logger.error(
          'Durability flush to feature_usage failed',
          err as Error,
        ),
      );
  }

  /**
   * Fetches the current billing cycle window (`current_period_start` / `current_period_end`)
   * from `vendor_subscriptions` for the given company.
   *
   * Used exclusively by `getUsageWindow()` when `reset_interval = 'billing_cycle'`. Billing
   * cycles are anchored to the subscription start date (e.g. the 15th of the month), so they
   * cannot be derived from calendar arithmetic alone.
   *
   * @param companyId — UUID of the company.
   * @throws {Error} if no active subscription row exists, or if billing period dates are missing.
   */
  async resolveBillingCycleWindow(
    companyId: string,
  ): Promise<{ start: Date; end: Date }> {
    const sub = await this.db.query.vendor_subscriptions.findFirst({
      where: eq(vendor_subscriptions.company_id, companyId),
    });
    if (!sub?.current_period_start || !sub?.current_period_end) {
      throw new Error(
        `No active billing period found for company ${companyId}`,
      );
    }
    return { start: sub.current_period_start, end: sub.current_period_end };
  }
}
