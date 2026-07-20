import {
  EnforcementMode,
  FeatureValueType,
  ResetInterval,
} from '../../../drizzle/types/types.js';

/**
 * A fully-resolved snapshot of what a single feature grants to a company on their current plan.
 *
 * Built by `EntitlementResolverService.resolve()` and stored in the `EntitlementMap`.
 * All fields are read-only after construction — never mutate in place.
 */
export interface ResolvedEntitlement {
  /** The string identifier used in code to reference this feature (e.g. `'max_products'`). */
  featureKey: string;
  /**
   * How the `limitValue` / usage counter should be interpreted:
   * - `BOOLEAN`  — on/off capability; `isEnabled` is the only gate.
   * - `COUNTER`  — cumulative, lifetime count (e.g. total products created). Stored in Postgres.
   * - `GAUGE`    — point-in-time measurement (e.g. seats currently occupied). Stored in Postgres.
   * - `RATE`     — windowed throughput cap (e.g. API calls per day). Stored in Redis.
   */
  valueType: FeatureValueType;
  /** Whether the plan has this feature switched on at all. Check this before any quota logic. */
  isEnabled: boolean;
  /**
   * When `true`, the company has unlimited access to this feature regardless of `limitValue`.
   * Always check this before reading `limitValue` — `limitValue` is meaningless when unlimited.
   */
  isUnlimited: boolean;
  /**
   * The numeric cap for this feature in the current window/period.
   * `null` when `isUnlimited` is `true`, or when the plan row did not specify a value.
   * **Always check `isUnlimited` first.**
   */
  limitValue: number | null;
  /**
   * For RATE-type features: when the usage counter resets.
   * `null` for COUNTER/GAUGE features which never reset (lifetime counters).
   */
  resetInterval: ResetInterval | null;
  /**
   * Controls what happens when a quota is exceeded:
   * - `'hard'` — the request is blocked with 403/429.
   * - `'soft'` — the request is allowed but flagged for billing/analytics (overage tracking).
   */
  enforcementMode: EnforcementMode;
}

/**
 * Describes the usability state of a company's subscription.
 *
 * - `active`       — paid, within current billing period; all plan features are available.
 * - `trial`        — within a free trial window; trial features are available.
 * - `grace_period` — subscription has lapsed but the grace window has not yet expired;
 *                    features remain accessible to allow the customer time to renew.
 * - `none`         — no usable subscription (no row, trial expired, or grace period over);
 *                    all feature checks return `{ allowed: false, reason: 'no_subscription' }`.
 */
export enum SubscriptionUsability {
  ACTIVE = 'active',
  TRIAL = 'trial',
  GRACE_PERIOD = 'grace_period',
  NONE = 'none',
}

/**
 * Immutable, cache-friendly view of everything a company is entitled to under their current plan.
 *
 * ## Lifecycle
 * 1. Built **once** per `EntitlementResolverService.resolve()` call.
 * 2. Serialized to Redis (via `toJSON()`) and cached for up to 5 minutes.
 * 3. On cache hit, reconstructed from the plain-object JSON using `EntitlementMap.fromJSON()`.
 * 4. Passed to `AccessCheckService` which calls `get(featureKey)` for each feature check.
 *
 * ## Why a class, not a plain object?
 * The internal storage is a `Map` for O(1) keyed lookup. Since `Map` does not survive
 * JSON serialization, the `toJSON()` / `fromJSON()` pair handles the Redis round-trip correctly.
 *
 * @example
 * ```ts
 * const map = await resolver.resolve(companyId);
 * const entitlement = map.get('max_products');
 * if (!entitlement?.isEnabled) { ... }
 * ```
 */
export class EntitlementMap {
  private constructor(
    private readonly entitlements: Map<string, ResolvedEntitlement>,
    public readonly subscriptionState: SubscriptionUsability,
  ) {}

  /**
   * Creates an empty entitlement map with no features granted.
   * Used when the company has no usable subscription (`subscriptionState === 'none'`).
   *
   * @param subscriptionState — defaults to `'none'` if omitted.
   */
  static empty(
    subscriptionState: SubscriptionUsability = SubscriptionUsability.NONE,
  ): EntitlementMap {
    return new EntitlementMap(new Map(), subscriptionState);
  }

  /**
   * Builds an `EntitlementMap` from raw `plan_feature_limits` rows (joined with their
   * `feature_definitions` relation).
   *
   * Rows whose feature is inactive (`is_active = false`) are silently skipped — retired
   * features never grant access, even if a plan row still references them.
   *
   * @param rows            — Drizzle query results with the `feature` relation eager-loaded.
   * @param subscriptionState — the usability classification of the company's subscription.
   */
  static fromRows(
    rows: Array<{
      is_enabled: boolean;
      limit_value: number | null;
      is_unlimited: boolean;
      reset_interval: ResetInterval | null;
      feature: {
        feature_key: string;
        value_type: FeatureValueType;
        enforcement_mode: string;
        is_active: boolean | null;
      };
    }>,
    subscriptionState: SubscriptionUsability,
  ): EntitlementMap {
    const map = new Map<string, ResolvedEntitlement>();
    for (const row of rows) {
      if (!row.feature.is_active) continue; // retired features never grant access
      map.set(row.feature.feature_key, {
        featureKey: row.feature.feature_key,
        valueType: row.feature.value_type,
        isEnabled: row.is_enabled,
        isUnlimited: row.is_unlimited,
        limitValue: row.limit_value,
        resetInterval: row.reset_interval,
        enforcementMode:
          (row.feature.enforcement_mode as EnforcementMode) ??
          EnforcementMode.HARD,
      });
    }
    return new EntitlementMap(map, subscriptionState);
  }

  /**
   * Reconstructs an `EntitlementMap` instance from a plain JSON object.
   *
   * **Required for Redis cache round-trips.** When an `EntitlementMap` is stored in Redis
   * via `cache-manager`, it is JSON-stringified. `Map` instances lose their prototype during
   * this process, so the cached value comes back as a plain object — calling `.get()` on it
   * would throw `TypeError: cached.get is not a function`. This factory restores the full
   * class instance from that plain-object snapshot.
   *
   * The shape of `json` must match the output of `toJSON()`. Do not use any other
   * serialization path.
   *
   * @param json — the plain object produced by `toJSON()` and retrieved from Redis.
   */
  static fromJSON(json: ReturnType<EntitlementMap['toJSON']>): EntitlementMap {
    const map = new Map<string, ResolvedEntitlement>(
      Object.entries(json.entitlements),
    );
    return new EntitlementMap(map, json.subscriptionState);
  }

  /**
   * Looks up the resolved entitlement for a given feature key.
   *
   * @returns the entitlement if the feature is configured on the company's plan,
   *          or `undefined` if the feature key is not in this plan at all.
   */
  get(featureKey: string): ResolvedEntitlement | undefined {
    return this.entitlements.get(featureKey);
  }

  /**
   * Returns `true` if the given feature key is present in this entitlement map,
   * regardless of whether the feature is currently enabled or not.
   */
  has(featureKey: string): boolean {
    return this.entitlements.has(featureKey);
  }

  /**
   * Produces a plain, JSON-serializable representation of this map.
   *
   * Used implicitly by `JSON.stringify()` (and therefore by `cache-manager`) when storing
   * the map in Redis. The inverse operation is `EntitlementMap.fromJSON()` — always use
   * that method to reconstruct the class instance from a cached value.
   */
  toJSON() {
    return {
      subscriptionState: this.subscriptionState,
      entitlements: Object.fromEntries(this.entitlements),
    };
  }
}
