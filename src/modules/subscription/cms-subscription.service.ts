import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { eq, and, ne } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module.js';
import {
  cms_plans,
  cms_plan_versions,
  cms_plan_prices,
  cms_plan_features,
  cms_sync_jobs,
  subscription_plans,
  vendor_subscriptions,
  subscription_events,
} from '../../drizzle/schema/subscription.schema.js';
import {
  PlanStatus,
  JobStatus,
  SyncStatus,
  PriceInterval,
  FeatureType,
} from '../../drizzle/types/types.js';
import { PlanPayloadDto } from './dto/plan.dto.js';
import * as crypto from 'crypto';
import { Client } from '@upstash/qstash';

@Injectable()
export class CmsSubscriptionService {
  private readonly qstashClient: Client;
  private readonly logger = new Logger(CmsSubscriptionService.name);
  constructor(@Inject(DRIZZLE) private db: DrizzleService) {
    // Ideally from ConfigService, simplified for brevity
    this.qstashClient = new Client({
      token: process.env.QSTASH_TOKEN || 'mock-token',
    });
  }

  async getAdminPlans() {
    const plans = await this.db.query.cms_plans.findMany({
      where: ne(cms_plans.status, PlanStatus.ARCHIVED),
      with: {
        prices: true,
        features: true,
      },
    });

    const planMap = new Map<string, (typeof plans)[0]>();
    for (const p of plans) {
      const existing = planMap.get(p.plan_key);
      if (!existing || p.status === PlanStatus.DRAFT) {
        planMap.set(p.plan_key, p);
      }
    }
    return Array.from(planMap.values());
  }

  async getPublicPlans() {
    return await this.db.query.cms_plans.findMany({
      where: eq(cms_plans.status, PlanStatus.LIVE),
      with: {
        prices: true,
        features: true,
      },
    });
  }

  async createPlan(planKey: string, adminId: string) {
    const normalizedKey = planKey.trim().toLowerCase().replace(/\s+/g, '-');

    const existing = await this.db.query.cms_plans.findFirst({
      where: and(
        eq(cms_plans.plan_key, normalizedKey),
        ne(cms_plans.status, PlanStatus.ARCHIVED),
      ),
    });
    if (existing) {
      throw new ConflictException(
        `Plan template '${normalizedKey}' already exists.`,
      );
    }

    return await this.db.transaction(async (tx) => {
      const [newPlan] = await tx
        .insert(cms_plans)
        .values({
          plan_key: normalizedKey,
          status: PlanStatus.DRAFT,
          version: 1,
          created_by: adminId,
          updated_by: adminId,
        })
        .returning();

      // Seed with default prices (monthly & yearly)
      await tx.insert(cms_plan_prices).values([
        {
          plan_id: newPlan.id,
          currency: 'INR',
          interval: PriceInterval.MONTHLY,
          interval_count: null,
          amount_minor_units: 0,
          currency_exponent: 2,
          sync_status: SyncStatus.PENDING,
        },
        {
          plan_id: newPlan.id,
          currency: 'INR',
          interval: PriceInterval.YEARLY,
          interval_count: null,
          amount_minor_units: 0,
          currency_exponent: 2,
          sync_status: SyncStatus.PENDING,
        },
      ]);

      return newPlan;
    });
  }

  async updateDraft(planKey: string, payload: PlanPayloadDto, adminId: string) {
    return await this.db.transaction(async (tx) => {
      // Find existing draft
      let draft = await tx.query.cms_plans.findFirst({
        where: and(
          eq(cms_plans.plan_key, planKey),
          eq(cms_plans.status, PlanStatus.DRAFT),
        ),
      });

      if (!draft) {
        [draft] = await tx
          .insert(cms_plans)
          .values({
            plan_key: planKey,
            description: payload.description ?? null,
            status: PlanStatus.DRAFT,
            version: 1,
            created_by: adminId,
            updated_by: adminId,
          })
          .returning();
      } else {
        if (payload.version < draft.version) {
          throw new ConflictException(
            'Version mismatch: client version is older than server head.',
          );
        }

        // Update draft version with optimistic locking check
        [draft] = await tx
          .update(cms_plans)
          .set({
            version: draft.version + 1,
            description: payload.description ?? null,
            updated_by: adminId,
          })
          .where(
            and(
              eq(cms_plans.id, draft.id),
              eq(cms_plans.version, payload.version),
            ),
          )
          .returning();

        if (!draft) {
          throw new ConflictException(
            'Version mismatch: plan was updated by another administrator. Please refresh the page.',
          );
        }
      }

      // Clear existing prices and features for the draft
      await tx
        .delete(cms_plan_prices)
        .where(eq(cms_plan_prices.plan_id, draft.id));
      await tx
        .delete(cms_plan_features)
        .where(eq(cms_plan_features.plan_id, draft.id));

      // Insert new prices
      if (payload.prices && payload.prices.length > 0) {
        await tx.insert(cms_plan_prices).values(
          payload.prices.map((p) => ({
            plan_id: draft.id,
            currency: p.currency,
            interval: ([
              PriceInterval.DAILY,
              PriceInterval.WEEKLY,
              PriceInterval.QUARTERLY,
            ].includes(p.interval as PriceInterval)
              ? PriceInterval.CUSTOM
              : (p.interval as PriceInterval)) as any,
            interval_count: p.interval_count ?? null,
            amount_minor_units: p.amount_minor_units,
            currency_exponent: p.currency_exponent,
            sync_status: SyncStatus.PENDING,
          })),
        );
      }

      // Insert new features
      if (payload.features && payload.features.length > 0) {
        await tx.insert(cms_plan_features).values(
          payload.features.map((f) => ({
            plan_id: draft.id,
            feature_key: f.feature_key,
            type: f.type as FeatureType,
            value: String(f.value),
          })),
        );
      }

      // Record audit log
      await tx.insert(cms_plan_versions).values({
        plan_id: draft.id,
        version_number: draft.version,
        changed_by: adminId,
        diff_json: payload,
        change_reason: 'Draft autosave',
      });

      return draft;
    });
  }

  async publishDraft(planKey: string, adminId: string) {
    let livePlanId: string | null = null;
    let idempotencyKey: string | null = null;

    const live = await this.db.transaction(async (tx) => {
      const draft = await tx.query.cms_plans.findFirst({
        where: and(
          eq(cms_plans.plan_key, planKey),
          eq(cms_plans.status, PlanStatus.DRAFT),
        ),
        with: { prices: true, features: true },
      });

      if (!draft) {
        throw new NotFoundException(`Draft plan not found for key: ${planKey}`);
      }

      // Rename existing archived plans to avoid unique constraint index conflicts
      await tx
        .update(cms_plans)
        .set({ plan_key: `${planKey}-archived-${Date.now()}` })
        .where(
          and(
            eq(cms_plans.plan_key, planKey),
            eq(cms_plans.status, PlanStatus.ARCHIVED),
          ),
        );

      // Archive previous live if exists
      await tx
        .update(cms_plans)
        .set({ status: PlanStatus.ARCHIVED })
        .where(
          and(
            eq(cms_plans.plan_key, planKey),
            eq(cms_plans.status, PlanStatus.LIVE),
          ),
        );

      // Promote draft to live
      const [live] = await tx
        .update(cms_plans)
        .set({ status: PlanStatus.LIVE, updated_by: adminId })
        .where(eq(cms_plans.id, draft.id))
        .returning();

      // --- SYNC TO LIVE SUBSCRIPTION_PLANS ---
      let priceMonthly = '0';
      let priceAnnual = '0';
      let annualTotal = '0';

      draft.prices.forEach((p) => {
        if (p.interval === PriceInterval.MONTHLY) {
          priceMonthly = (
            p.amount_minor_units / Math.pow(10, p.currency_exponent)
          ).toString();
        } else if (p.interval === PriceInterval.YEARLY) {
          annualTotal = (
            p.amount_minor_units / Math.pow(10, p.currency_exponent)
          ).toString();
          priceAnnual = (parseFloat(annualTotal) / 12).toFixed(2);
        }
      });

      const capabilities: Record<string, unknown> = {};
      draft.features.forEach((f) => {
        if (f.type === FeatureType.BOOLEAN) {
          capabilities[f.feature_key] = f.value === 'true';
        } else if (f.type === FeatureType.NUMBER) {
          capabilities[f.feature_key] = Number(f.value);
        } else {
          capabilities[f.feature_key] = f.value;
        }
      });

      const existingSubPlan = await tx.query.subscription_plans.findFirst({
        where: eq(subscription_plans.plan_name, planKey),
      });

      if (existingSubPlan) {
        await tx
          .update(subscription_plans)
          .set({
            display_name: planKey.charAt(0).toUpperCase() + planKey.slice(1), // Basic fallback if not defined
            price_monthly: priceMonthly,
            price_annual: priceAnnual,
            annual_total: annualTotal,
            capabilities,
            description: draft.description ?? null,
            is_active: true,
          })
          .where(eq(subscription_plans.id, existingSubPlan.id));
      } else {
        await tx.insert(subscription_plans).values({
          plan_name: planKey,
          display_name: planKey.charAt(0).toUpperCase() + planKey.slice(1),
          price_monthly: priceMonthly,
          price_annual: priceAnnual,
          annual_total: annualTotal,
          capabilities,
          description: draft.description ?? null,
          is_active: true,
          display_order: 99, // default to end
        });
      }

      // Enqueue sync job
      const operation = 'publish';
      idempotencyKey = crypto
        .createHash('sha256')
        .update(`${live.id}-${live.version}-${operation}`)
        .digest('hex');

      await tx.insert(cms_sync_jobs).values({
        plan_id: live.id,
        idempotency_key: idempotencyKey,
        status: JobStatus.PENDING,
      });

      livePlanId = live.id;
      return live;
    });

    // Enqueue the job to our own webhook via QStash OUTSIDE the transaction
    if (livePlanId && idempotencyKey) {
      try {
        const callbackUrl = `${process.env.PUBLIC_API_URL || process.env.QSTASH_CALLBACK_BASE_URL}/api/v1/internal/subscription/subscription-sync`;
        await this.qstashClient.publishJSON({
          url: callbackUrl,
          body: { jobId: idempotencyKey, planId: livePlanId },
        });
      } catch (err) {
        // Log error but don't fail the operation.
        // A fallback cron job can sweep pending jobs.
        this.logger.error(
          `Failed to publish plan ${planKey} to gateway: ${JSON.stringify(err)}`,
        );
      }
    }

    return live;
  }

  async unpublishPlan(planKey: string, adminId: string) {
    return await this.db.transaction(async (tx) => {
      const livePlan = await tx.query.cms_plans.findFirst({
        where: and(
          eq(cms_plans.plan_key, planKey),
          eq(cms_plans.status, PlanStatus.LIVE),
        ),
      });

      if (!livePlan) {
        throw new NotFoundException(`Live plan not found for key: ${planKey}`);
      }

      // Check if a draft plan already exists for this key
      const draftPlan = await tx.query.cms_plans.findFirst({
        where: and(
          eq(cms_plans.plan_key, planKey),
          eq(cms_plans.status, PlanStatus.DRAFT),
        ),
      });

      if (draftPlan) {
        // Rename existing archived plans to avoid unique index conflict
        await tx
          .update(cms_plans)
          .set({ plan_key: `${planKey}-archived-${Date.now()}` })
          .where(
            and(
              eq(cms_plans.plan_key, planKey),
              eq(cms_plans.status, PlanStatus.ARCHIVED),
            ),
          );

        // If a draft already exists, archive the live one so only the draft remains
        await tx
          .update(cms_plans)
          .set({ status: PlanStatus.ARCHIVED, updated_by: adminId })
          .where(eq(cms_plans.id, livePlan.id));
      } else {
        // If no draft exists, demote the live plan to draft
        await tx
          .update(cms_plans)
          .set({ status: PlanStatus.DRAFT, updated_by: adminId })
          .where(eq(cms_plans.id, livePlan.id));
      }

      // Also set is_active: false in the public subscription_plans table
      await tx
        .update(subscription_plans)
        .set({ is_active: false })
        .where(eq(subscription_plans.plan_name, planKey));

      return { success: true };
    });
  }

  async getAdminSubscriptions() {
    return await this.db.query.vendor_subscriptions.findMany({
      with: {
        company: true,
        plan: true,
      },
    });
  }

  async updateVendorSubscription(subscriptionId: string, payload: any) {
    const updateData: any = {};
    if (payload.plan_id !== undefined) updateData.plan_id = payload.plan_id;
    if (payload.status !== undefined) updateData.status = payload.status;

    if (payload.trial_starts_at !== undefined) {
      updateData.trial_starts_at = payload.trial_starts_at
        ? new Date(payload.trial_starts_at)
        : null;
    }
    if (payload.trial_ends_at !== undefined) {
      updateData.trial_ends_at = payload.trial_ends_at
        ? new Date(payload.trial_ends_at)
        : null;
    }
    if (payload.current_period_start !== undefined) {
      updateData.current_period_start = payload.current_period_start
        ? new Date(payload.current_period_start)
        : null;
    }
    if (payload.current_period_end !== undefined) {
      updateData.current_period_end = payload.current_period_end
        ? new Date(payload.current_period_end)
        : null;
    }
    if (payload.grace_period_ends_at !== undefined) {
      updateData.grace_period_ends_at = payload.grace_period_ends_at
        ? new Date(payload.grace_period_ends_at)
        : null;
    }
    if (payload.cancelled_at !== undefined) {
      updateData.cancelled_at = payload.cancelled_at
        ? new Date(payload.cancelled_at)
        : null;
    }

    updateData.updated_at = new Date();

    const [updated] = await this.db
      .update(vendor_subscriptions)
      .set(updateData)
      .where(eq(vendor_subscriptions.id, subscriptionId))
      .returning();

    if (!updated) {
      throw new NotFoundException(
        `Vendor subscription not found for ID: ${subscriptionId}`,
      );
    }

    // Record audit event log
    await this.db
      .insert(subscription_events)
      .values({
        company_id: updated.company_id,
        subscription_id: updated.id,
        event_type: 'admin_updated',
        plan_id: updated.plan_id,
        metadata: payload,
      })
      .catch((err) => {});

    return updated;
  }

  async getLiveSubscriptionPlans() {
    return await this.db.query.subscription_plans.findMany({
      where: eq(subscription_plans.is_active, true),
    });
  }
}
