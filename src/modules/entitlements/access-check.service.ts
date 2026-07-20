import { Injectable, Logger, Inject } from '@nestjs/common';
import { type DrizzleService, DRIZZLE } from '../../drizzle/drizzle.module.js';
import { feature_access_denials } from '../../drizzle/schema/subscription.schema.js';
import { EntitlementResolverService } from './entitlement-resolver.service.js';
import { UsageTrackerService } from './usage-tracker.service.js';
import { AccessDecision } from './types/access-decision.js';
import { resolveWindow } from './utils/window.util.js';
import {
  EnforcementMode,
  FeatureValueType,
  ResetInterval,
} from '../../drizzle/types/types.js';
import { SubscriptionUsability } from './types/entitlement-map.js';

/**
 * The single entry-point for all feature access decisions.
 *
 * ## Responsibilities
 * 1. Resolve the company's `EntitlementMap` (from cache or DB via `EntitlementResolverService`).
 * 2. Check whether a specific feature is enabled and within quota.
 * 3. Optionally consume quota atomically when the action succeeds (`checkAndConsume`).
 * 4. Fire-and-forget log every denial to `feature_access_denials` for observability.
 *
 * ## Two public methods
 * | Method | Use case |
 * |--------|----------|
 * | `check()` | Read-only pre-flight gate (e.g. UI disabling a button, gating a GET endpoint). Does **not** consume quota. |
 * | `checkAndConsume()` | Write/action gate — checks quota and, if allowed, atomically increments usage. |
 *
 * ## Enforcement modes
 * - `hard` — the caller should block the request and return 403/429.
 * - `soft` — the caller may still allow the request but flag it for billing/analytics.
 *
 * Callers are responsible for reading `entitlement.enforcementMode` from the entitlement map
 * if they need to differentiate hard vs. soft blocks. `AccessDecision.allowed` reflects the
 * quota check result regardless of enforcement mode.
 */
@Injectable()
export class AccessCheckService {
  private readonly logger = new Logger(AccessCheckService.name);

  constructor(
    private readonly resolver: EntitlementResolverService,
    private readonly tracker: UsageTrackerService,
    @Inject(DRIZZLE) private readonly db: DrizzleService,
  ) {}

  /**
   * Read-only access check — does **not** consume quota.
   *
   * Use this for:
   * - Gating read endpoints (GET routes that respect feature access).
   * - Pre-flight UI checks (e.g. disabling a "Create Product" button when at the limit).
   *
   * For write operations or any action that should consume a quota unit, use
   * `checkAndConsume()` instead.
   *
   * @param companyId  — UUID of the company making the request.
   * @param featureKey — the feature string key (e.g. `'max_products'`).
   * @returns an `AccessDecision` describing whether access is allowed and why.
   */
  async check(companyId: string, featureKey: string): Promise<AccessDecision> {
    const entitlements = await this.resolver.resolve(companyId);

    if (entitlements.subscriptionState === SubscriptionUsability.NONE) {
      this.recordDenial(companyId, featureKey, 'no_subscription');
      return { allowed: false, reason: 'no_subscription' };
    }

    const entitlement = entitlements.get(featureKey);
    if (!entitlement) {
      return { allowed: false, reason: 'unknown_feature' };
    }
    if (!entitlement.isEnabled) {
      this.recordDenial(companyId, featureKey, 'feature_disabled');
      return { allowed: false, reason: 'feature_disabled' };
    }
    if (entitlement.isUnlimited) {
      return { allowed: true };
    }

    // Pass the reset interval hint to avoid an extra getPlanFeatureLimit DB call (Bug #5).
    const currentUsage = await this.tracker.getCurrentUsage(
      companyId,
      featureKey,
      entitlement.resetInterval,
    );
    const limit = entitlement.limitValue ?? 0;
    const allowed = currentUsage < limit;
    const isOverLimit = currentUsage > limit;

    if (!allowed) {
      this.recordDenial(companyId, featureKey, 'quota_exceeded');
    }

    return {
      allowed,
      reason: allowed ? undefined : 'quota_exceeded',
      currentUsage,
      limit,
      isOverLimit,
      retryAfterSeconds: !allowed
        ? await this.secondsUntilReset(companyId, entitlement.resetInterval)
        : undefined,
    };
  }

  /**
   * Atomic check + consume — use for the **"consume on the action that succeeds"** pattern.
   *
   * ### Atomicity strategy (by feature type)
   *
   * **RATE features (Redis):** Increments first, then checks the returned value.
   * A single +`amount` overshoot per concurrent pair of requests is tolerated — RATE windows
   * self-reset and hard denial fires on every subsequent call. This is the standard Redis
   * rate-limit pattern; true atomic INCR+check is unavailable via `cache-manager`.
   *
   * **COUNTER / GAUGE features (Postgres):** Check first, then increment. These features are
   * low-frequency (e.g. "create a product"), so the TOCTOU window is acceptable. The DB
   * `CHECK` constraint (`chk_usage_non_negative`) is the final safety backstop.
   *
   * @param companyId  — UUID of the company making the request.
   * @param featureKey — the feature string key.
   * @param amount     — units to consume if allowed (default: 1).
   * @returns an `AccessDecision`. If `allowed` is `true`, quota has already been incremented.
   */
  async checkAndConsume(
    companyId: string,
    featureKey: string,
    amount = 1,
  ): Promise<AccessDecision> {
    const entitlements = await this.resolver.resolve(companyId);

    if (entitlements.subscriptionState === SubscriptionUsability.NONE) {
      this.recordDenial(companyId, featureKey, 'no_subscription');
      return { allowed: false, reason: 'no_subscription' };
    }

    const entitlement = entitlements.get(featureKey);
    if (!entitlement) {
      return { allowed: false, reason: 'unknown_feature' };
    }
    if (!entitlement.isEnabled) {
      this.recordDenial(companyId, featureKey, 'feature_disabled');
      return { allowed: false, reason: 'feature_disabled' };
    }
    if (entitlement.isUnlimited) {
      // Still increment for analytics tracking, but don't gate on the result.
      await this.tracker.increment(
        companyId,
        featureKey,
        amount,
        entitlement.resetInterval,
      );
      return { allowed: true };
    }

    const limit = entitlement.limitValue ?? 0;

    if (entitlement.valueType === FeatureValueType.RATE) {
      // Redis INCR is the closest to atomic we can get with cache-manager.
      // A +amount overshoot per concurrent pair is tolerated; windows self-reset.
      const newUsage = await this.tracker.increment(
        companyId,
        featureKey,
        amount,
        entitlement.resetInterval,
      );
      const allowed = newUsage <= limit;
      if (!allowed) {
        if (entitlement.enforcementMode === EnforcementMode.SOFT) {
          return {
            allowed: true,
            currentUsage: newUsage,
            limit,
            isOverLimit: true,
          };
        }
        this.recordDenial(companyId, featureKey, 'quota_exceeded');
        return {
          allowed: false,
          reason: 'quota_exceeded',
          currentUsage: newUsage,
          limit,
          retryAfterSeconds: await this.secondsUntilReset(companyId, entitlement.resetInterval),
        };
      }
      return { allowed: true, currentUsage: newUsage, limit };
    }

    // ✅ Bug #2 fix — COUNTER/GAUGE: atomic check-and-increment via conditional update.
    const newUsage = await this.tracker.checkAndIncrement(
      companyId,
      featureKey,
      limit,
      entitlement.enforcementMode,
      amount,
      entitlement.resetInterval,
    );

    if (newUsage === false) {
      this.recordDenial(companyId, featureKey, 'quota_exceeded');
      const currentUsage = await this.tracker.getCurrentUsage(
        companyId,
        featureKey,
        entitlement.resetInterval,
      );
      return {
        allowed: false,
        reason: 'quota_exceeded',
        currentUsage,
        limit,
        isOverLimit: currentUsage > limit,
        retryAfterSeconds: await this.secondsUntilReset(companyId, entitlement.resetInterval),
      };
    }

    return {
      allowed: true,
      currentUsage: newUsage,
      limit,
      isOverLimit: newUsage > limit,
    };
  }

  /**
   * Calculates how many seconds remain until the current quota window resets.
   *
   * Returned in `AccessDecision.retryAfterSeconds` for rate-limit denials so that HTTP
   * guards can set a `Retry-After` response header.
   *
   * Returns `undefined` for features with no reset interval (COUNTER/GAUGE), since their
   * quota never automatically resets.
   *
   * @param resetInterval — the feature's reset interval, or `null`.
   */
  private async secondsUntilReset(
    companyId: string,
    resetInterval: ResetInterval | null,
  ): Promise<number | undefined> {
    if (!resetInterval) return undefined;

    let window;
    if (resetInterval === ResetInterval.BILLING_CYCLE) {
      window = await this.tracker.resolveBillingCycleWindow(companyId);
    } else {
      window = resolveWindow(resetInterval);
    }

    return Math.max(0, Math.ceil((window.end.getTime() - Date.now()) / 1000));
  }

  /**
   * Inserts a `feature_access_denials` row for observability and billing analytics.
   *
   * **Always fire-and-forget** — a denial log write must never block or fail the
   * request that triggered it. Errors are logged but swallowed.
   *
   * @param companyId  — UUID of the company that was denied.
   * @param featureKey — the feature that was denied.
   * @param reason     — the denial reason string (matches `AccessDenialReason`).
   */
  private recordDenial(
    companyId: string,
    featureKey: string,
    reason: string,
  ) {
    this.db
      .insert(feature_access_denials)
      .values({ company_id: companyId, feature_key: featureKey, reason })
      .catch((err) =>
        this.logger.error(
          'Failed to record feature_access_denials row',
          err as Error,
        ),
      );
  }
}
