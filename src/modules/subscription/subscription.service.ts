import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Logger,
  forwardRef,
} from '@nestjs/common';
import { and, asc, desc, eq, gt, gte, isNull, lt, or } from 'drizzle-orm';
import { MailService } from '../../common/services/mail/mail.service.js';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module.js';
import {
  subscription_events,
  subscription_plans,
  vendor_subscriptions,
} from '../../drizzle/schema/subscription.schema.js';
import { SubscriptionStatus } from '../../drizzle/types/types.js';
import { CompanyService } from '../company/company.service.js';
import { domainExtractor } from '../../common/filters/domainExtractor.filter.js';
import { SubscriptionErrorKeyEnum } from './constants/subscription.enums.js';

export enum BannerUrgency {
  INFO = 'info',
  WARNING = 'warning',
  DANGER = 'danger',
}
// ─── Pure date helpers (no external lib needed) ───────────────────────────────
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function differenceInDays(future: Date, from: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((future.getTime() - from.getTime()) / msPerDay);
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}
// ─────────────────────────────────────────────────────────────────────────────

export interface Subscription {
  id: string;
  company_id: string;
  status: string;
  plan_name: string;
  plan_display_name: string;
  days_remaining: number | null;
  trial_ends_at: Date | null;
  is_trial: boolean;
  is_expired: boolean;
  is_active: boolean;
  in_grace_period: boolean;
  show_banner: boolean; // true when trial has ≤ 10 days left
  banner_urgency: BannerUrgency;
}
@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);
  constructor(
    @Inject(DRIZZLE)
    private db: DrizzleService,
    private mailService: MailService,
    @Inject(forwardRef(() => CompanyService))
    private readonly companyService: CompanyService,
  ) {}
  /** Returns the plan row whose plan_name = 'trial' */
  private async getTrialPlan() {
    let dbError: any = null;
    let plan = await this.db.query.subscription_plans
      .findFirst({
        where: eq(subscription_plans.plan_name, SubscriptionStatus.TRIAL),
      })
      .catch((err) => {
        this.logger.error('Failed to fetch trial plan from database', err);
        dbError = err;
        return null;
      });

    if (!plan) {
      // Fallback to the first available active plan (usually starter)
      plan = await this.db.query.subscription_plans
        .findFirst({
          where: and(
            eq(subscription_plans.is_active, true),
            gt(subscription_plans.trial_days, 0),
          ),
          orderBy: (plans, { desc }) => [desc(plans.trial_days)],
        })
        .catch((err) => {
          this.logger.error(
            'Failed to fetch fallback trial plan from database',
            err,
          );
          dbError = err;
          return null;
        });
    }

    if (!plan) {
      throw new InternalServerErrorException(
        SubscriptionErrorKeyEnum.FAILED_TO_FETCH_TRIAL_PLAN,
        {
          cause:
            dbError ||
            new Error('No active subscription plans found to assign for trial'),
        },
      );
    }
    return plan;
  }
  private async resolvePlanById(
    planId: string | null,
    notFoundMsg: string,
    fetchErrorMsg: string,
  ) {
    if (!planId) throw new NotFoundException(notFoundMsg);
    const plan = await this.db.query.subscription_plans
      .findFirst({
        where: eq(subscription_plans.id, planId),
      })
      .catch((err) => {
        throw new InternalServerErrorException(fetchErrorMsg, { cause: err });
      });
    if (!plan) throw new NotFoundException(notFoundMsg);
    return plan;
  }

  /** Returns all trial subscriptions ending on a given calendar day */
  private async getTrialsEndingOn(targetDate: Date) {
    const dayStart = startOfDay(targetDate);
    const dayEnd = addDays(dayStart, 1);

    return this.db
      .select()
      .from(vendor_subscriptions)
      .where(
        and(
          eq(vendor_subscriptions.status, SubscriptionStatus.TRIAL),
          gte(vendor_subscriptions.trial_ends_at, dayStart),
          lt(vendor_subscriptions.trial_ends_at, dayEnd),
        ),
      )
      .catch((error) => {
        throw new InternalServerErrorException(
          'Failed to fetch trial subscriptions ending on target date',
          {
            cause: error,
          },
        );
      });
  }

  /** Appends a row to subscription_events — fire-and-forget, never throws */
  private async logEvent(
    companyId: string,
    eventType: string,
    metadata: Record<string, unknown> = {},
    subscriptionId?: string,
    planId?: string,
  ) {
    try {
      await this.db
        .insert(subscription_events)
        .values({
          company_id: companyId,
          subscription_id: subscriptionId ?? null,
          event_type: eventType,
          plan_id: planId ?? null,
          metadata,
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            'Failed to log subscription event',
            {
              cause: error,
            },
          );
        });
    } catch (err) {
      // Log but never crash the calling operation
      this.logger.error(`Failed to log subscription event "${eventType}"`, err);
    }
  }

  /** Derives banner urgency from days remaining */
  private getBannerUrgency(daysRemaining: number): BannerUrgency {
    if (daysRemaining <= 1) return BannerUrgency.DANGER;
    if (daysRemaining <= 3) return BannerUrgency.WARNING;
    return BannerUrgency.INFO;
  }

  private isUuid(val: string): boolean {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(val);
  }

  private async resolveCompanyId(domainOrId: string): Promise<string> {
    if (!domainOrId) {
      throw new NotFoundException('Company domain or ID is required');
    }
    if (this.isUuid(domainOrId)) {
      return domainOrId;
    }
    const filterDomain = domainExtractor(domainOrId);
    return await this.companyService.find(filterDomain);
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Called by VendorsService.approveVendor() immediately after approval.
   * Creates a trial subscription for the company.
   */
  async startTrial(
    companyIdOrDomain: string,
    selectedPlanId?: string,
  ): Promise<void> {
    const companyId = await this.resolveCompanyId(companyIdOrDomain);

    // Check if subscription already exists for this company
    const existing = await this.db.query.vendor_subscriptions
      .findFirst({
        where: eq(vendor_subscriptions.company_id, companyId),
      })
      .catch((error) => {
        throw new InternalServerErrorException(
          'Failed to check existing subscription status',
          {
            cause: error,
          },
        );
      });
    // If a pending trial exists (created during registration), activate it.
    if (existing && !existing.trial_starts_at) {
      let plan;
      if (selectedPlanId) {
        plan = await this.resolvePlanById(
          selectedPlanId,
          'Selected plan not found for trial',
          'Failed to fetch selected plan',
        );
      } else {
        // Fetch the plan currently assigned to this pending subscription
        plan = await this.resolvePlanById(
          existing.plan_id,
          'Assigned plan not found',
          'Failed to fetch assigned plan',
        );
      }

      const now = new Date();
      const trialEnd = addDays(now, plan.trial_days ?? 14);

      await this.db
        .update(vendor_subscriptions)
        .set({
          plan_id: plan.id,
          status: SubscriptionStatus.TRIAL,
          trial_starts_at: now,
          trial_ends_at: trialEnd,
          current_period_start: now,
          current_period_end: trialEnd,
        })
        .where(eq(vendor_subscriptions.id, existing.id))
        .catch((err) => {
          this.logger.error(
            `Failed to activate pending trial subscription for company ${companyId}`,
            err,
          );
          throw new InternalServerErrorException(
            SubscriptionErrorKeyEnum.FAILED_TO_START_TRIAL_SUBSCRIPTION,
            { cause: err },
          );
        });

      await this.logEvent(
        companyId,
        'trial_started',
        { plan_name: plan.plan_name, trial_end: trialEnd.toISOString() },
        existing.id,
      );
      return;
    } else if (existing) {
      this.logger.log(
        `Subscription already exists with status '${existing.status}' for company ${companyId}. Skipping trial creation.`,
      );
      return;
    }

    let plan;
    if (selectedPlanId) {
      plan = await this.resolvePlanById(
        selectedPlanId,
        'Selected plan not found for trial',
        'Failed to fetch selected plan for trial',
      );
    } else {
      plan = await this.getTrialPlan();
    }
    const now = new Date();
    const trialEnd = addDays(now, plan.trial_days ?? 14);
    const [sub] = await this.db
      .insert(vendor_subscriptions)
      .values({
        company_id: companyId,
        plan_id: plan.id,
        status: SubscriptionStatus.TRIAL,
        trial_starts_at: now,
        trial_ends_at: trialEnd,
        current_period_start: now,
        current_period_end: trialEnd,
      })
      .returning()
      .catch((err) => {
        this.logger.error(
          `Failed to create trial subscription for company ${companyId}`,
          err,
        );
        throw new InternalServerErrorException(
          SubscriptionErrorKeyEnum.FAILED_TO_START_TRIAL_SUBSCRIPTION,
          {
            cause: err,
          },
        );
      });

    await this.logEvent(
      companyId,
      'trial_started',
      { trial_days: plan.trial_days, trial_ends_at: trialEnd.toISOString() },
      sub.id,
      plan.id,
    );

    this.logger.log(
      `Trial started for company ${companyId} — ends ${trialEnd.toISOString()}`,
    );
  }

  /**
   * Returns the full subscription status object for a company.
   * Used by the API endpoint and the SubscriptionGuard.
   */
  async getSubscriptionStatus(
    companyIdOrDomain: string,
  ): Promise<Subscription | null> {
    const companyId = await this.resolveCompanyId(companyIdOrDomain);
    const sub = await this.db.query.vendor_subscriptions
      .findFirst({
        where: eq(vendor_subscriptions.company_id, companyId),
        with: { plan: true },
      })
      .catch((err) => {
        this.logger.error(
          `Failed to fetch subscription status for company ${companyId}`,
          err,
        );
        throw new InternalServerErrorException(
          SubscriptionErrorKeyEnum.FAILED_TO_FETCH_SUBSCRIPTION_STATUS,
          {
            cause: err,
          },
        );
      });

    if (!sub) return null;

    const now = new Date();
    const daysRemaining =
      sub.trial_ends_at != null
        ? Math.max(0, differenceInDays(sub.trial_ends_at, now))
        : null;

    const isTrial = sub.status === SubscriptionStatus.TRIAL;
    const isExpired = sub.status === SubscriptionStatus.EXPIRED;
    const inGracePeriod = sub.status === SubscriptionStatus.GRACE_PERIOD;
    const isActive = sub.status === SubscriptionStatus.ACTIVE;

    const showBanner =
      (isTrial && daysRemaining !== null && daysRemaining <= 10) ||
      inGracePeriod;

    let bannerUrgency = BannerUrgency.INFO;
    if (inGracePeriod) {
      bannerUrgency = BannerUrgency.WARNING;
    } else if (showBanner && daysRemaining !== null) {
      bannerUrgency = this.getBannerUrgency(daysRemaining);
    }

    return {
      id: sub.id,
      company_id: sub.company_id,
      status: sub.status,
      plan_name: sub.plan.plan_name,
      plan_display_name: sub.plan.display_name,
      days_remaining: daysRemaining,
      trial_ends_at: sub.trial_ends_at,
      is_trial: isTrial,
      is_expired: isExpired,
      is_active: isActive,
      in_grace_period: inGracePeriod,
      show_banner: showBanner,
      banner_urgency: bannerUrgency,
    };
  }

  async getAvailablePlans(companyIdOrDomain?: string) {
    const baseWhere = eq(subscription_plans.is_active, true);

    if (companyIdOrDomain) {
      try {
        const companyId = await this.resolveCompanyId(companyIdOrDomain);
        if (companyId) {
          const plan = await this.db
            .select()
            .from(subscription_plans)
            .where(and(baseWhere, eq(subscription_plans.company_id, companyId)))
            .orderBy(asc(subscription_plans.display_order))
            .catch((error) => {
              throw new InternalServerErrorException(
                'Failed to fetch available subscription plans for company',
                {
                  cause: error,
                },
              );
            });

          if (plan.length > 0) return plan;
        }
      } catch (err) {
        this.logger.warn(
          `Could not resolve company for plan selection: ${companyIdOrDomain}`,
        );
      }
    }

    const plan = await this.db
      .select()
      .from(subscription_plans)
      .where(baseWhere)
      .orderBy(asc(subscription_plans.display_order))
      .catch((error) => {
        throw new InternalServerErrorException(
          'Failed to fetch available subscription plans',
          {
            cause: error,
          },
        );
      });
    return plan;
  }

  /**
   * Upgrades (or downgrades) a company's subscription to a paid plan.
   * Clears trial fields and sets a 30-day billing period.
   */
  async upgradePlan(
    companyIdOrDomain: string,
    newPlanId: string,
  ): Promise<void> {
    const companyId = await this.resolveCompanyId(companyIdOrDomain);
    const now = new Date();
    const periodEnd = addDays(now, 30);

    const [updated] = await this.db
      .update(vendor_subscriptions)
      .set({
        plan_id: newPlanId,
        status: SubscriptionStatus.ACTIVE,
        trial_ends_at: null,
        current_period_start: now,
        current_period_end: periodEnd,
        updated_at: now,
      })
      .where(eq(vendor_subscriptions.company_id, companyId))
      .returning()
      .catch((error) => {
        throw new InternalServerErrorException(
          'Failed to upgrade subscription plan',
          {
            cause: error,
          },
        );
      });

    if (!updated) {
      throw new InternalServerErrorException(
        `Failed to upgrade: subscription record not found for company ${companyId}`,
      );
    }

    await this.logEvent(
      companyId,
      'upgraded',
      { new_plan_id: newPlanId, period_end: periodEnd.toISOString() },
      updated.id,
      newPlanId,
    );
  }

  /**
   * Marks expired trials as 'grace_period' and returns affected company IDs.
   * Called by the cron job every 6 hours.
   */
  async expireTrials(): Promise<string[]> {
    const now = new Date();

    const expired = await this.db
      .update(vendor_subscriptions)
      .set({
        status: SubscriptionStatus.GRACE_PERIOD,
        grace_period_ends_at: addDays(now, 3),
        updated_at: now,
      })
      .where(
        and(
          eq(vendor_subscriptions.status, SubscriptionStatus.TRIAL),
          lt(vendor_subscriptions.trial_ends_at, now),
        ),
      )
      .returning()
      .catch((error) => {
        throw new InternalServerErrorException(
          'Failed to update expired trial subscriptions',
          {
            cause: error,
          },
        );
      });

    for (const sub of expired) {
      await this.logEvent(sub.company_id, 'trial_expired', {}, sub.id);
    }

    return expired.map((s) => s.company_id);
  }

  /**
   * Finds all trial subscriptions ending exactly N days from now.
   * Used by the cron to send reminder emails.
   */
  async getTrialsEndingInDays(days: number) {
    const targetDate = addDays(new Date(), days);
    return this.getTrialsEndingOn(targetDate);
  }

  /**
   * Moves grace_period subscriptions that have passed their grace window
   * to 'expired' — called by the cron job.
   */
  async finalizeExpiredGracePeriods(): Promise<string[]> {
    const now = new Date();

    const finalized = await this.db
      .update(vendor_subscriptions)
      .set({ status: SubscriptionStatus.EXPIRED, updated_at: now })
      .where(
        and(
          eq(vendor_subscriptions.status, SubscriptionStatus.GRACE_PERIOD),
          lt(vendor_subscriptions.grace_period_ends_at, now),
        ),
      )
      .returning()
      .catch((error) => {
        throw new InternalServerErrorException(
          'Failed to finalize expired grace period subscriptions',
          {
            cause: error,
          },
        );
      });

    for (const sub of finalized) {
      await this.logEvent(sub.company_id, 'grace_period_ended', {}, sub.id);
    }

    return finalized.map((s) => s.company_id);
  }
}
