import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { eq } from 'drizzle-orm';
import { type DrizzleService, DRIZZLE } from '../../drizzle/drizzle.module.js';
import {
  vendor_subscriptions,
  plan_feature_limits,
} from '../../drizzle/schema/subscription.schema.js';
import { SubscriptionStatus } from '../../drizzle/types/types.js';
import {
  EntitlementMap,
  SubscriptionUsability,
} from './types/entitlement-map.js';

/** Cached for 5 min — plan changes must call `invalidate()` explicitly to bust the cache. */
const CACHE_TTL_ACTIVE_MS = 300_000;
/**
 * Shorter TTL for "no access" states so a company that just subscribed (or renewed)
 * picks up their entitlements quickly without waiting a full 5 minutes.
 */
const CACHE_TTL_BLOCKED_MS = 60_000;

/**
 * Resolves and caches the full set of feature entitlements for a company.
 *
 * ## Responsibility
 * This service answers the question: *"Given this company's current subscription,
 * what is it allowed to do and up to what limits?"*
 *
 * It loads `vendor_subscriptions` + `plan_feature_limits` from Postgres, converts them
 * into an `EntitlementMap`, and caches the result in Redis for up to 5 minutes.
 *
 * ## Cache invalidation
 * The cache TTL is a safety-net only. Any operation that changes a company's plan or
 * feature limits **must** call `invalidate(companyId)` immediately so the new entitlements
 * take effect without waiting for the TTL to expire. This includes:
 * - Plan upgrades / downgrades
 * - CMS plan publish
 * - Manual admin overrides to `plan_feature_limits`
 *
 * ## Why `EntitlementMap.fromJSON()` for cache reads?
 * `cache-manager` serializes cached values to JSON via `JSON.stringify`. `Map` instances
 * lose their prototype during this process — the retrieved value is a plain object, so
 * `.get()` would throw `TypeError: cached.get is not a function`. `fromJSON()` restores
 * the full class instance from the serialized plain object.
 */
@Injectable()
export class EntitlementResolverService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /** @internal Redis key namespace for entitlement caching. */
  private cacheKey(companyId: string): string {
    return `entitlements:${companyId}`;
  }

  /**
   * Returns the full `EntitlementMap` for the given company, using a Redis cache to
   * avoid hitting Postgres on every request.
   *
   * On a cache miss:
   * 1. Fetches `vendor_subscriptions` for the company.
   * 2. Classifies the subscription's usability state.
   * 3. If usable, fetches `plan_feature_limits` joined with `feature_definitions`.
   * 4. Builds an `EntitlementMap` and caches it.
   *
   * On a cache hit, the stored plain-object JSON is reconstructed into a proper
   * `EntitlementMap` class instance via `EntitlementMap.fromJSON()`.
   *
   * @param companyId — UUID of the company whose entitlements to resolve.
   * @returns a fully-populated `EntitlementMap` (or an empty map if no usable subscription).
   */
  async resolve(companyId: string): Promise<EntitlementMap> {
    // Cache stores the output of EntitlementMap.toJSON() — a plain object.
    // We must reconstruct the class instance so that .get() / .has() work correctly.
    const rawCached = await this.cache.get<
      ReturnType<EntitlementMap['toJSON']>
    >(this.cacheKey(companyId));
    if (rawCached) return EntitlementMap.fromJSON(rawCached);

    const subscription = await this.db.query.vendor_subscriptions.findFirst({
      where: eq(vendor_subscriptions.company_id, companyId),
    });

    const usability = this.classifySubscription(subscription);

    if (usability === 'none' || !subscription) {
      const empty = EntitlementMap.empty(usability);
      await this.cache.set(
        this.cacheKey(companyId),
        empty,
        CACHE_TTL_BLOCKED_MS,
      );
      return empty;
    }

    const limitRows = await this.db.query.plan_feature_limits.findMany({
      where: eq(plan_feature_limits.plan_id, subscription.plan_id),
      with: { feature: true },
    });

    const map = EntitlementMap.fromRows(limitRows as any, usability);
    await this.cache.set(
      this.cacheKey(companyId),
      map,
      CACHE_TTL_ACTIVE_MS,
    );
    return map;
  }

  /**
   * Busts the cached `EntitlementMap` for the given company.
   *
   * **Must be called** after any operation that changes a company's plan or any of its
   * `plan_feature_limits` rows, including:
   * - Plan upgrades / downgrades
   * - CMS plan publish / unpublish
   * - Manual admin overrides to feature limits
   *
   * Without calling this, the company will continue operating under their old entitlements
   * until the cache TTL expires (up to 5 minutes).
   *
   * @param companyId — UUID of the company whose cache entry should be invalidated.
   */
  async invalidate(companyId: string): Promise<void> {
    await this.cache.del(this.cacheKey(companyId));
  }

  /**
   * Determines whether a subscription row translates to a usable entitlement state.
   *
   * ### Classification rules (in priority order):
   * 1. **No subscription row** → `'none'`
   * 2. **`status = ACTIVE`** → `'active'`
   * 3. **`status = TRIAL`** → `'trial'` if `trial_ends_at` is in the future (or absent),
   *    otherwise `'none'`. The timestamp check guards against cron-job lag at the trial
   *    boundary — a cron may not have flipped `status` to `EXPIRED` yet.
   * 4. **Any other status** (e.g. `CANCELLED`, `EXPIRED`, `PAST_DUE`) with a still-valid
   *    `grace_period_ends_at` → `'grace_period'`. This lets cancelled/expired subscriptions
   *    retain access for a short window (typically 3 days) to allow renewal.
   * 5. **Everything else** → `'none'`.
   *
   * @param sub — the raw `vendor_subscriptions` row, or `undefined` if no row exists.
   */
  private classifySubscription(
    sub: typeof vendor_subscriptions.$inferSelect | undefined,
  ): SubscriptionUsability {
    if (!sub) return SubscriptionUsability.NONE;

    if (
      sub.status === SubscriptionStatus.ACTIVE &&
      (!sub.current_period_end || sub.current_period_end > new Date())
    ) {
      return SubscriptionUsability.ACTIVE;
    }

    if (sub.status === SubscriptionStatus.TRIAL) {
      // Don't trust `status` alone — a cron job may not have flipped it yet
      // right at the trial boundary. Check the timestamp directly.
      if (!sub.trial_ends_at || sub.trial_ends_at > new Date())
        return SubscriptionUsability.TRIAL;
      return SubscriptionUsability.NONE;
    }

    // All other statuses (CANCELLED, EXPIRED, PAST_DUE, …) fall here.
    // If the company is within its grace period, grant continued access so they
    // have time to renew before being hard-blocked.
    if (sub.grace_period_ends_at && sub.grace_period_ends_at > new Date()) {
      return SubscriptionUsability.GRACE_PERIOD;
    }

    return SubscriptionUsability.NONE;
  }
}
