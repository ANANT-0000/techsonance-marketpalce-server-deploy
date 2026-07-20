/**
 * Canonical set of reasons an access check can be denied.
 *
 * - `no_subscription`  — the company has no subscription row at all, or its trial / grace period has lapsed.
 * - `feature_disabled` — the feature exists in the plan but is explicitly toggled off.
 * - `quota_exceeded`   — the company has consumed all of its allowed units for this feature in the current window.
 * - `unknown_feature`  — the `featureKey` is not present in the company's entitlement map (misconfigured plan or typo).
 */
export type AccessDenialReason =
  | 'no_subscription'
  | 'feature_disabled'
  | 'quota_exceeded'
  | 'unknown_feature';

/**
 * The outcome of a feature access check.
 *
 * When `allowed` is `true`:
 *   - `reason` is absent.
 *   - `currentUsage` / `limit` may be present for metered features so the caller
 *     can surface quota information in the UI.
 *
 * When `allowed` is `false`:
 *   - `reason` identifies the exact denial cause.
 *   - `retryAfterSeconds` is set for RATE-type denials so the HTTP guard can emit a
 *     `Retry-After` response header.
 *   - `isOverLimit` is `true` when usage already exceeds a limit that was *recently
 *     lowered* (e.g. after a plan downgrade). In this state reads are still allowed
 *     but writes/consumptions are blocked until usage falls back under the cap.
 *
 * **Note:** Unlimited features return `{ allowed: true }` with no `limit` field.
 * The `limit` field is only present for metered (bounded) features.
 */
export interface AccessDecision {
  allowed: boolean;
  reason?: AccessDenialReason;
  currentUsage?: number;
  /**
   * The numeric cap that applies in the current window.
   * Absent for unlimited features (they short-circuit before this field is set).
   * `0` means the plan explicitly grants zero units of this feature.
   */
  limit?: number;
  /** Populated for RATE-type denials so the guard can set a `Retry-After` header. */
  retryAfterSeconds?: number;
  /**
   * `true` when usage already exceeds a newly-lowered limit (post-downgrade).
   * Read-only operations should still be allowed; write/consume operations should be blocked.
   */
  isOverLimit?: boolean;
}
