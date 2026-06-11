import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  forwardRef,
} from '@nestjs/common';
import { and, asc, eq, gte, lt } from 'drizzle-orm';
import { MailService } from '../../common/services/mail/mail.service';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import {
  subscription_events,
  subscription_plans,
  vendor_subscriptions,
} from '../../drizzle/schema/subscription.schema';
import { SubscriptionStatus } from '../../drizzle/types/types';
import { CompanyService } from '../company/company.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { SubscriptionErrorKeyEnum } from './constants/subscription.enums';

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
  capabilities: Record<string, unknown>;
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
  ) { }
  /** Returns the plan row whose plan_name = 'trial' */
  private async getTrialPlan() {
    const plan = await this.db.query.subscription_plans
      .findFirst({
        where: eq(subscription_plans.plan_name, SubscriptionStatus.TRIAL),
      })
      .catch((err) => {
        this.logger.error('Failed to fetch trial plan from database', err);
        throw new InternalServerErrorException(SubscriptionErrorKeyEnum.FAILED_TO_FETCH_TRIAL_PLAN, {
          cause: err,
        });
      });
    if (!plan) {
      throw new Error(
        'No trial plan found in subscription_plans. Seed the plan first.',
      );
    }
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
      );
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
      await this.db.insert(subscription_events).values({
        company_id: companyId,
        subscription_id: subscriptionId ?? null,
        event_type: eventType,
        plan_id: planId ?? null,
        metadata,
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
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(val);
  }

  private async resolveCompanyId(domainOrId: string): Promise<string> {
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
  async startTrial(companyIdOrDomain: string): Promise<void> {
    const companyId = await this.resolveCompanyId(companyIdOrDomain);

    // Check if subscription already exists for this company
    const existing = await this.db.query.vendor_subscriptions.findFirst({
      where: eq(vendor_subscriptions.company_id, companyId),
    });
    if (existing) {
      this.logger.log(
        `Subscription already exists for company ${companyId}. Skipping trial creation.`,
      );
      return;
    }

    const plan = await this.getTrialPlan();
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
    const sub = await this.db.query.vendor_subscriptions.findFirst({
      where: eq(vendor_subscriptions.company_id, companyId),
      with: { plan: true },
    }).catch((err) => {
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
      bannerUrgency = this.getBannerUrgency(daysRemaining)
    }

    return {
      id: sub.id,
      company_id: sub.company_id,
      status: sub.status,
      plan_name: sub.plan.plan_name,
      plan_display_name: sub.plan.display_name,
      capabilities: (sub.plan.capabilities as Record<string, unknown>) ?? {},
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

  /**
   * Fetches all available plans to display on the onboarding plan-selection step.
   */
  async getAvailablePlans() {
    return this.db
      .select()
      .from(subscription_plans)
      .where(eq(subscription_plans.is_active, true))
      .orderBy(asc(subscription_plans.display_order));
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
      .returning();

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
      .returning();

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
      .returning();

    for (const sub of finalized) {
      await this.logEvent(sub.company_id, 'grace_period_ended', {}, sub.id);
    }

    return finalized.map((s) => s.company_id);
  }

  /**
   * Checks whether a company is allowed to use a specific feature.
   * Returns true/false — used by the guard for soft gating.
   */
  async canUseFeature(companyId: string, featureKey: string): Promise<boolean> {
    const status = await this.getSubscriptionStatus(companyId);
    if (!status) return false;
    if (status.is_expired) return false;

    // Grace period gets read-only access — no feature creation
    if (status.in_grace_period && featureKey !== 'read') return false;

    const cap = status.capabilities[featureKey];
    if (cap === undefined) return true; // not restricted
    if (typeof cap === 'boolean') return cap;
    return true;
  }
}
