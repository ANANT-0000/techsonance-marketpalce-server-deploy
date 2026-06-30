/**
 * GuardOperation — the four operations that must pass the eligibility guard
 * before being processed.
 *
 * NOTE: EXCHANGE is intentionally mapped to REPLACEMENT at the DB / ReturnType
 * level (no extra enum migration needed). The guard enforces identical rules
 * for both operations; the only difference is the UI label.
 */
export enum GuardOperation {
  RETURN = 'RETURN',
  REPLACEMENT = 'REPLACEMENT',
  CANCELLATION = 'CANCELLATION',
  EXCHANGE = 'EXCHANGE',
}

/**
 * Input contract for OrderEligibilityGuardService.assertEligible().
 * Callers (ReturnsService, OrdersService, etc.) must supply all four fields.
 */
export class GuardInput {
  /** UUID of the order_items row being acted on */
  orderItemId!: string;

  /** UUID of the authenticated user making the request */
  userId!: string;

  /** UUID of the company/tenant — resolved from the request domain */
  companyId!: string;

  /** Which operation is being attempted */
  operation!: GuardOperation;
}
