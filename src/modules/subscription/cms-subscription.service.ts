import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module.js';
import {
  cms_plans,
  cms_plan_versions,
  cms_plan_prices,
  cms_plan_features,
  cms_sync_jobs,
  subscription_plans,
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

  constructor(@Inject(DRIZZLE) private db: DrizzleService) {
    // Ideally from ConfigService, simplified for brevity
    this.qstashClient = new Client({
      token: process.env.QSTASH_TOKEN || 'mock-token',
    });
  }

  async getAdminPlans() {
    return this.db.query.cms_plans.findMany({
      with: {
        prices: true,
        features: true,
      },
    });
  }

  async getPublicPlans() {
    return this.db.query.cms_plans.findMany({
      where: eq(cms_plans.status, PlanStatus.LIVE),
      with: {
        prices: {
          where: eq(cms_plan_prices.sync_status, SyncStatus.SYNCED),
        },
        features: true,
      },
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

      if (draft) {
        if (payload.version < draft.version) {
          throw new ConflictException(
            'Version mismatch: client version is older than server head.',
          );
        }
        // Update draft version
        [draft] = await tx
          .update(cms_plans)
          .set({ version: draft.version + 1, updated_by: adminId })
          .where(eq(cms_plans.id, draft.id))
          .returning();
      } else {
        // Create new draft
        [draft] = await tx
          .insert(cms_plans)
          .values({
            plan_key: planKey,
            status: PlanStatus.DRAFT,
            version: 1,
            created_by: adminId,
            updated_by: adminId,
          })
          .returning();
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
            interval: p.interval as PriceInterval,
            interval_count: p.intervalCount,
            amount_cents: p.amountCents,
            sync_status: SyncStatus.PENDING,
          })),
        );
      }

      // Insert new features
      if (payload.features && payload.features.length > 0) {
        await tx.insert(cms_plan_features).values(
          payload.features.map((f) => ({
            plan_id: draft.id,
            feature_key: f.key,
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
    return await this.db.transaction(async (tx) => {
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
      
      draft.prices.forEach(p => {
        if (p.interval === PriceInterval.MONTHLY) {
          priceMonthly = (p.amount_minor_units / Math.pow(10, p.currency_exponent)).toString();
        } else if (p.interval === PriceInterval.YEARLY) {
          annualTotal = (p.amount_minor_units / Math.pow(10, p.currency_exponent)).toString();
          priceAnnual = (parseFloat(annualTotal) / 12).toFixed(2);
        }
      });

      const capabilities: Record<string, unknown> = {};
      draft.features.forEach(f => {
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
        await tx.update(subscription_plans).set({
          display_name: planKey.charAt(0).toUpperCase() + planKey.slice(1), // Basic fallback if not defined
          price_monthly: priceMonthly,
          price_annual: priceAnnual,
          annual_total: annualTotal,
          capabilities,
          is_active: true,
        }).where(eq(subscription_plans.id, existingSubPlan.id));
      } else {
        await tx.insert(subscription_plans).values({
          plan_name: planKey,
          display_name: planKey.charAt(0).toUpperCase() + planKey.slice(1),
          price_monthly: priceMonthly,
          price_annual: priceAnnual,
          annual_total: annualTotal,
          capabilities,
          is_active: true,
          display_order: 99, // default to end
        });
      }

      // Enqueue sync job
      const operation = 'publish';
      const idempotencyKey = crypto
        .createHash('sha256')
        .update(`${live.id}-${live.version}-${operation}`)
        .digest('hex');

      await tx.insert(cms_sync_jobs).values({
        plan_id: live.id,
        idempotency_key: idempotencyKey,
        status: JobStatus.PENDING,
      });

      // Enqueue the job to our own webhook via QStash
      try {
        await this.qstashClient.publishJSON({
          url: `${process.env.PUBLIC_API_URL}/v1/jobs/subscription-sync`,
          body: { jobId: idempotencyKey, planId: live.id },
        });
      } catch (err) {
        // Log error but don't fail the transaction.
        // A fallback cron job can sweep pending jobs.
        console.error('Failed to enqueue QStash job', err);
      }

      return live;
    });
  }
}
