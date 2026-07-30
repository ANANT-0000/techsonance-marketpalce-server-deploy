import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { eq, and, ne, inArray, sql } from 'drizzle-orm';
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
  plan_feature_limits,
  feature_definitions,
} from '../../drizzle/schema/subscription.schema.js';
import { UpdateFeatureLimitDto } from './dto/update-feature-limit.dto.js';
import { CreateFeatureDefinitionDto } from './dto/create-feature-definition.dto.js';
import { UpdateFeatureDefinitionDto } from './dto/update-feature-definition.dto.js';
import {
  PlanStatus,
  JobStatus,
  SyncStatus,
  PriceInterval,
  EnforcementMode,
  FeatureValueType,
} from '../../drizzle/types/types.js';
import { PlanPayloadDto } from './dto/plan.dto.js';
import { EntitlementResolverService } from '../entitlements/entitlement-resolver.service.js';
import * as crypto from 'crypto';
import { Client } from '@upstash/qstash';

@Injectable()
export class CmsSubscriptionService {
  private readonly qstashClient: Client;
  private readonly logger = new Logger(CmsSubscriptionService.name);
  constructor(
    @Inject(DRIZZLE) private db: DrizzleService,
    private readonly entitlementResolverService: EntitlementResolverService,
  ) {
    // Ideally from ConfigService, simplified for brevity
    this.qstashClient = new Client({
      token: process.env.QSTASH_TOKEN || 'mock-token',
    });
  }

  async getAdminPlans() {
    const plans = await this.db.query.cms_plans
      .findMany({
        where: ne(cms_plans.status, PlanStatus.ARCHIVED),
        with: {
          prices: true,
          features: true,
        },
      })
      .catch((error) => {
        throw new InternalServerErrorException(
          'Failed to fetch plan templates',
          {
            cause: error,
          },
        );
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
    return await this.db.query.cms_plans
      .findMany({
        where: eq(cms_plans.status, PlanStatus.LIVE),
        with: {
          prices: true,
          features: true,
        },
      })
      .catch((error) => {
        throw new InternalServerErrorException('Failed to fetch active plans', {
          cause: error,
        });
      });
  }

  async createPlan(planKey: string, adminId: string) {
    const normalizedKey = planKey.trim().toLowerCase().replace(/\s+/g, '-');

    const existing = await this.db.query.cms_plans
      .findFirst({
        where: and(
          eq(cms_plans.plan_key, normalizedKey),
          ne(cms_plans.status, PlanStatus.ARCHIVED),
        ),
      })
      .catch((error) => {
        throw new InternalServerErrorException(
          'Failed to verify plan template existence',
          {
            cause: error,
          },
        );
      });
    if (existing) {
      throw new ConflictException(
        `Plan template '${normalizedKey}' already exists.`,
      );
    }

    return await this.db
      .transaction(async (tx) => {
        const [newPlan] = await tx
          .insert(cms_plans)
          .values({
            plan_key: normalizedKey,
            status: PlanStatus.DRAFT,
            version: 1,
            created_by: adminId,
            updated_by: adminId,
          })
          .returning()
          .catch((error) => {
            throw new InternalServerErrorException(
              'Failed to create plan template',
              {
                cause: error,
              },
            );
          });

        // Seed with default prices (monthly & yearly)
        await tx
          .insert(cms_plan_prices)
          .values([
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
          ])
          .catch((error) => {
            throw new InternalServerErrorException(
              'Failed to assign default prices to plan',
              {
                cause: error,
              },
            );
          });

        return newPlan;
      })
      .catch((error) => {
        throw new InternalServerErrorException(
          'Failed to create plan due to a transaction error',
          {
            cause: error,
          },
        );
      });
  }

  async updateDraft(planKey: string, payload: PlanPayloadDto, adminId: string) {
    return await this.db
      .transaction(async (tx) => {
        // Find existing draft
        let draft = await tx.query.cms_plans
          .findFirst({
            where: and(
              eq(cms_plans.plan_key, planKey),
              eq(cms_plans.status, PlanStatus.DRAFT),
            ),
          })
          .catch((error) => {
            throw new InternalServerErrorException(
              'Failed to fetch plan draft details',
              {
                cause: error,
              },
            );
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
            .returning()
            .catch((error) => {
              throw new InternalServerErrorException(
                'Failed to create plan template',
                {
                  cause: error,
                },
              );
            });
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
            .returning()
            .catch((error) => {
              throw new InternalServerErrorException(
                'Failed to update plan draft',
                {
                  cause: error,
                },
              );
            });

          if (!draft) {
            throw new ConflictException(
              'Version mismatch: plan was updated by another administrator. Please refresh the page.',
            );
          }
        }

        // Clear existing prices and features for the draft
        await tx
          .delete(cms_plan_prices)
          .where(eq(cms_plan_prices.plan_id, draft.id))
          .catch((error) => {
            throw new InternalServerErrorException(
              'Failed to clear previous plan prices',
              {
                cause: error,
              },
            );
          });
        await tx
          .delete(cms_plan_features)
          .where(eq(cms_plan_features.plan_id, draft.id))
          .catch((error) => {
            throw new InternalServerErrorException(
              'Failed to clear previous plan features',
              {
                cause: error,
              },
            );
          });

        // Insert new prices
        if (payload.prices && payload.prices.length > 0) {
          await tx
            .insert(cms_plan_prices)
            .values(
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
            )
            .catch((error) => {
              throw new InternalServerErrorException(
                'Failed to save plan prices',
                {
                  cause: error,
                },
              );
            });
        }

        // Insert new features
        if (payload.features && payload.features.length > 0) {
          await tx
            .insert(cms_plan_features)
            .values(
              payload.features.map((f) => ({
                plan_id: draft.id,
                feature_key: f.feature_key,
                type: f.type as FeatureValueType,
                value: String(f.value),
              })),
            )
            .catch((error) => {
              throw new InternalServerErrorException(
                'Failed to save plan features',
                {
                  cause: error,
                },
              );
            });
        }

        // Record audit log
        await tx
          .insert(cms_plan_versions)
          .values({
            plan_id: draft.id,
            version_number: draft.version,
            changed_by: adminId,
            diff_json: payload,
            change_reason: 'Draft autosave',
          })
          .catch((error) => {
            throw new InternalServerErrorException(
              'Failed to log plan version change',
              {
                cause: error,
              },
            );
          });

        return draft;
      })
      .catch((error) => {
        throw new InternalServerErrorException(
          'Failed to update plan draft due to a transaction error',
          {
            cause: error,
          },
        );
      });
  }

  async publishDraft(planKey: string, adminId: string) {
    let livePlanId: string | null = null;
    let idempotencyKey: string | null = null;

    const result = await this.db
      .transaction(async (tx) => {
        const draft = await tx.query.cms_plans
          .findFirst({
            where: and(
              eq(cms_plans.plan_key, planKey),
              eq(cms_plans.status, PlanStatus.DRAFT),
            ),
            with: { prices: true, features: true },
          })
          .catch((error) => {
            throw new InternalServerErrorException(
              'Failed to fetch plan draft for publishing',
              {
                cause: error,
              },
            );
          });

        if (!draft) {
          throw new NotFoundException(
            `Draft plan not found for key: ${planKey}`,
          );
        }

        // 1a. Validate all feature keys against feature_definitions
        const featureKeys = draft.features.map((f) => f.feature_key);
        let featureDefs: any[] = [];
        if (featureKeys.length > 0) {
          featureDefs = await tx.query.feature_definitions.findMany({
            where: inArray(feature_definitions.feature_key, featureKeys),
          });
        }
        const defMap = new Map(featureDefs.map((d) => [d.feature_key, d]));
        const missingKeys = draft.features
          .filter((f) => !defMap.has(f.feature_key))
          .map((f) => f.feature_key);
        if (missingKeys.length > 0) {
          throw new ConflictException(
            `Cannot publish plan. Unknown feature keys: ${missingKeys.join(', ')}`,
          );
        }

        // Rename existing archived plans to avoid unique constraint index conflicts
        await tx
          .update(cms_plans)
          .set({ plan_key: sql`${cms_plans.plan_key} || '-archived-' || ${cms_plans.id}::text` })
          .where(
            and(
              eq(cms_plans.plan_key, planKey),
              eq(cms_plans.status, PlanStatus.ARCHIVED),
            ),
          )
          .catch((error) => {
            throw new InternalServerErrorException(
              'Failed to rename archived plan templates',
              {
                cause: error,
              },
            );
          });

        // Archive previous live if exists
        await tx
          .update(cms_plans)
          .set({ status: PlanStatus.ARCHIVED })
          .where(
            and(
              eq(cms_plans.plan_key, planKey),
              eq(cms_plans.status, PlanStatus.LIVE),
            ),
          )
          .catch((error) => {
            throw new InternalServerErrorException(
              'Failed to archive existing live plan',
              {
                cause: error,
              },
            );
          });

        // Promote draft to live
        const [live] = await tx
          .update(cms_plans)
          .set({ status: PlanStatus.LIVE, updated_by: adminId })
          .where(eq(cms_plans.id, draft.id))
          .returning()
          .catch((error) => {
            throw new InternalServerErrorException(
              'Failed to promote draft plan to live',
              {
                cause: error,
              },
            );
          });

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

        const existingSubPlan = await tx.query.subscription_plans
          .findFirst({
            where: eq(subscription_plans.plan_name, planKey),
          })
          .catch((error) => {
            throw new InternalServerErrorException(
              'Failed to check active subscription plans',
              {
                cause: error,
              },
            );
          });

        let subPlanId: string;

        if (existingSubPlan) {
          await tx
            .update(subscription_plans)
            .set({
              display_name: planKey.charAt(0).toUpperCase() + planKey.slice(1), // Basic fallback if not defined
              price_monthly: priceMonthly,
              price_annual: priceAnnual,
              annual_total: annualTotal,
              description: draft.description ?? null,
              is_active: true,
            })
            .where(eq(subscription_plans.id, existingSubPlan.id))
            .catch((error) => {
              throw new InternalServerErrorException(
                'Failed to update active subscription plan',
                {
                  cause: error,
                },
              );
            });
          subPlanId = existingSubPlan.id;
        } else {
          const [inserted] = await tx
            .insert(subscription_plans)
            .values({
              plan_name: planKey,
              display_name: planKey.charAt(0).toUpperCase() + planKey.slice(1),
              price_monthly: priceMonthly,
              price_annual: priceAnnual,
              annual_total: annualTotal,
              description: draft.description ?? null,
              is_active: true,
              display_order: 99, // default to end
            })
            .returning()
            .catch((error) => {
              throw new InternalServerErrorException(
                'Failed to create active subscription plan',
                {
                  cause: error,
                },
              );
            });
          subPlanId = inserted.id;
        }

        // 1b. Upsert into plan_feature_limits
        if (draft.features.length > 0) {
          const limitsToInsert = draft.features.map((f) => {
            const def = defMap.get(f.feature_key);
            const isUnlimited = f.value === 'unlimited';
            const isBoolean = def.value_type === FeatureValueType.BOOLEAN;
            const isEnabled = isBoolean ? f.value === 'true' : true;
            const limitValue =
              isBoolean || isUnlimited ? null : Number(f.value);

            return {
              plan_id: subPlanId,
              feature_id: def.id,
              is_enabled: isEnabled,
              is_unlimited: isUnlimited,
              limit_value: limitValue,
            };
          });

          await tx
            .insert(plan_feature_limits)
            .values(limitsToInsert)
            .onConflictDoUpdate({
              target: [
                plan_feature_limits.plan_id,
                plan_feature_limits.feature_id,
              ],
              set: {
                is_enabled: sql`EXCLUDED.is_enabled`,
                is_unlimited: sql`EXCLUDED.is_unlimited`,
                limit_value: sql`EXCLUDED.limit_value`,
                updated_at: new Date(),
              },
            })
            .catch((error) => {
              throw new InternalServerErrorException(
                'Failed to upsert plan feature limits',
                { cause: error },
              );
            });
        }

        // Enqueue sync job
        const operation = 'publish';
        idempotencyKey = crypto
          .createHash('sha256')
          .update(`${live.id}-${live.version}-${operation}`)
          .digest('hex');

        await tx
          .insert(cms_sync_jobs)
          .values({
            plan_id: live.id,
            idempotency_key: idempotencyKey,
            status: JobStatus.PENDING,
          })
          .onConflictDoNothing()
          .catch((error) => {
            throw new InternalServerErrorException(
              'Failed to schedule gateway sync job',
              {
                cause: error,
              },
            );
          });

        livePlanId = live.id;
        return { live, subPlanId };
      })
      .catch((error) => {
        throw new InternalServerErrorException(
          'Failed to publish plan due to a transaction error',
          {
            cause: error,
          },
        );
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

    if (result.subPlanId) {
      await this.entitlementResolverService.invalidateByPlan(result.subPlanId);
    }

    return result.live;
  }

  async unpublishPlan(planKey: string, adminId: string) {
    const result = await this.db
      .transaction(async (tx) => {
        const livePlan = await tx.query.cms_plans
          .findFirst({
            where: and(
              eq(cms_plans.plan_key, planKey),
              eq(cms_plans.status, PlanStatus.LIVE),
            ),
          })
          .catch((error) => {
            throw new InternalServerErrorException(
              'Failed to fetch live plan details',
              {
                cause: error,
              },
            );
          });

        if (!livePlan) {
          throw new NotFoundException(
            `Live plan not found for key: ${planKey}`,
          );
        }

        // Check if a draft plan already exists for this key
        const draftPlan = await tx.query.cms_plans
          .findFirst({
            where: and(
              eq(cms_plans.plan_key, planKey),
              eq(cms_plans.status, PlanStatus.DRAFT),
            ),
          })
          .catch((error) => {
            throw new InternalServerErrorException(
              'Failed to check plan draft status',
              {
                cause: error,
              },
            );
          });

        if (draftPlan) {
          // Rename existing archived plans to avoid unique index conflict
          await tx
            .update(cms_plans)
            .set({ plan_key: sql`${cms_plans.plan_key} || '-archived-' || ${cms_plans.id}::text` })
            .where(
              and(
                eq(cms_plans.plan_key, planKey),
                eq(cms_plans.status, PlanStatus.ARCHIVED),
              ),
            )
            .catch((error) => {
              throw new InternalServerErrorException(
                'Failed to rename archived plan templates',
                {
                  cause: error,
                },
              );
            });

          // If a draft already exists, archive the live one so only the draft remains
          await tx
            .update(cms_plans)
            .set({ status: PlanStatus.ARCHIVED, updated_by: adminId })
            .where(eq(cms_plans.id, livePlan.id))
            .catch((error) => {
              throw new InternalServerErrorException(
                'Failed to archive live plan',
                {
                  cause: error,
                },
              );
            });
        } else {
          // If no draft exists, demote the live plan to draft
          await tx
            .update(cms_plans)
            .set({ status: PlanStatus.DRAFT, updated_by: adminId })
            .where(eq(cms_plans.id, livePlan.id))
            .catch((error) => {
              throw new InternalServerErrorException(
                'Failed to demote live plan to draft',
                {
                  cause: error,
                },
              );
            });
        }

        // Also set is_active: false in the public subscription_plans table
        await tx
          .update(subscription_plans)
          .set({ is_active: false })
          .where(eq(subscription_plans.plan_name, planKey))
          .catch((error) => {
            throw new InternalServerErrorException(
              'Failed to deactivate subscription plan',
              {
                cause: error,
              },
            );
          });

        const subPlan = await tx.query.subscription_plans.findFirst({
          where: eq(subscription_plans.plan_name, planKey),
          columns: { id: true },
        });

        return { success: true, subPlanId: subPlan?.id };
      })
      .catch((error) => {
        throw new InternalServerErrorException(
          'Failed to unpublish plan due to a transaction error',
          {
            cause: error,
          },
        );
      });

    if (result.subPlanId) {
      await this.entitlementResolverService.invalidateByPlan(result.subPlanId);
    }

    return { success: result.success };
  }

  async getAdminSubscriptions() {
    return await this.db.query.vendor_subscriptions
      .findMany({
        with: {
          company: true,
          plan: true,
        },
      })
      .catch((error) => {
        throw new InternalServerErrorException(
          'Failed to fetch admin subscription list',
          {
            cause: error,
          },
        );
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
      .returning()
      .catch((error) => {
        throw new InternalServerErrorException(
          'Failed to update vendor subscription',
          {
            cause: error,
          },
        );
      });

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
      .catch((err) => {
        throw new InternalServerErrorException(
          'Failed to log subscription event',
          {
            cause: err,
          },
        );
      });

    await this.entitlementResolverService.invalidate(updated.company_id);

    return updated;
  }

  async getLiveSubscriptionPlans() {
    return await this.db.query.subscription_plans
      .findMany({
        where: eq(subscription_plans.is_active, true),
      })
      .catch((error) => {
        throw new InternalServerErrorException(
          'Failed to fetch live subscription plans',
          {
            cause: error,
          },
        );
      });
  }

  async getPlanFeatureLimits(planKey: string) {
    const plan = await this.db.query.subscription_plans
      .findFirst({
        where: eq(subscription_plans.plan_name, planKey),
      })
      .catch((error) => {
        throw new InternalServerErrorException(
          'Failed to fetch subscription plan details',
          {
            cause: error,
          },
        );
      });
    if (!plan) {
      throw new NotFoundException(`Subscription plan '${planKey}' not found.`);
    }

    const features = await this.db.query.feature_definitions
      .findMany({
        where: eq(feature_definitions.is_active, true),
      })
      .catch((error) => {
        throw new InternalServerErrorException(
          'Failed to fetch feature definitions',
          {
            cause: error,
          },
        );
      });

    const limits = await this.db.query.plan_feature_limits
      .findMany({
        where: eq(plan_feature_limits.plan_id, plan.id),
      })
      .catch((error) => {
        throw new InternalServerErrorException(
          'Failed to fetch plan feature limits',
          {
            cause: error,
          },
        );
      });

    const data = features.map((feature) => {
      const limit = limits.find((l) => l.feature_id === feature.id);
      return {
        id: limit?.id,
        feature_id: feature.id,
        feature_key: feature.feature_key,
        is_enabled: limit ? limit.is_enabled : true,
        is_unlimited: limit ? limit.is_unlimited : true,
        limit_value: limit ? limit.limit_value : null,
        reset_interval: limit ? limit.reset_interval : null,
      };
    });

    return data;
  }

  async updatePlanFeatureLimit(
    planKey: string,
    featureId: string,
    payload: UpdateFeatureLimitDto,
  ) {
    const plan = await this.db.query.subscription_plans
      .findFirst({
        where: eq(subscription_plans.plan_name, planKey),
      })
      .catch((error) => {
        throw new InternalServerErrorException(
          'Failed to fetch subscription plan details',
          {
            cause: error,
          },
        );
      });
    if (!plan) {
      throw new NotFoundException(`Subscription plan '${planKey}' not found.`);
    }

    const feature = await this.db.query.feature_definitions
      .findFirst({
        where: eq(feature_definitions.id, featureId),
      })
      .catch((error) => {
        throw new InternalServerErrorException(
          'Failed to fetch feature definition details',
          {
            cause: error,
          },
        );
      });
    if (!feature) {
      throw new NotFoundException(
        `Feature definition '${featureId}' not found.`,
      );
    }

    const existing = await this.db.query.plan_feature_limits
      .findFirst({
        where: and(
          eq(plan_feature_limits.plan_id, plan.id),
          eq(plan_feature_limits.feature_id, featureId),
        ),
      })
      .catch((error) => {
        throw new InternalServerErrorException(
          'Failed to fetch existing plan feature limit',
          {
            cause: error,
          },
        );
      });

    if (existing) {
      await this.db
        .update(plan_feature_limits)
        .set({
          is_enabled: payload.is_enabled,
          is_unlimited: payload.is_unlimited,
          limit_value: payload.is_unlimited ? null : payload.limit_value,
          reset_interval: payload.reset_interval,
          updated_at: new Date(),
        })
        .where(eq(plan_feature_limits.id, existing.id))
        .catch((error) => {
          throw new InternalServerErrorException(
            'Failed to update plan feature limit',
            {
              cause: error,
            },
          );
        });
    } else {
      await this.db
        .insert(plan_feature_limits)
        .values({
          plan_id: plan.id,
          feature_id: featureId,
          is_enabled: payload.is_enabled,
          is_unlimited: payload.is_unlimited,
          limit_value: payload.is_unlimited ? null : payload.limit_value,
          reset_interval: payload.reset_interval,
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            'Failed to create plan feature limit',
            {
              cause: error,
            },
          );
        });
    }

    return { success: true };
  }

  async getFeatureDefinitions() {
    const list = await this.db.query.feature_definitions
      .findMany({
        orderBy: (fd, { asc }) => [asc(fd.feature_key)],
      })
      .catch((error) => {
        throw new InternalServerErrorException(
          'Failed to fetch feature definitions',
          {
            cause: error,
          },
        );
      });
    return list;
  }

  async createFeatureDefinition(payload: CreateFeatureDefinitionDto) {
    const normalizedKey = payload.feature_key
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
    const existing = await this.db.query.feature_definitions
      .findFirst({
        where: eq(feature_definitions.feature_key, normalizedKey),
      })
      .catch((error) => {
        throw new InternalServerErrorException(
          'Failed to verify feature definition existence',
          {
            cause: error,
          },
        );
      });
    if (existing) {
      throw new ConflictException(
        `Feature key '${normalizedKey}' already exists.`,
      );
    }

    const [created] = await this.db
      .insert(feature_definitions)
      .values({
        feature_key: normalizedKey,
        display_name: payload.display_name,
        description: payload.description ?? null,
        value_type: payload.value_type,
        enforcement_mode: payload.enforcement_mode ?? EnforcementMode.HARD,
        is_active: payload.is_active ?? true,
      })
      .returning()
      .catch((error) => {
        throw new InternalServerErrorException(
          'Failed to create feature definition',
          {
            cause: error,
          },
        );
      });

    return created;
  }

  async updateFeatureDefinition(
    id: string,
    payload: UpdateFeatureDefinitionDto,
  ) {
    const existing = await this.db.query.feature_definitions
      .findFirst({
        where: eq(feature_definitions.id, id),
      })
      .catch((error) => {
        throw new InternalServerErrorException(
          'Failed to fetch feature definition details',
          {
            cause: error,
          },
        );
      });
    if (!existing) {
      throw new NotFoundException(
        `Feature definition with ID '${id}' not found.`,
      );
    }

    const [updated] = await this.db
      .update(feature_definitions)
      .set({
        display_name:
          payload.display_name !== undefined
            ? payload.display_name
            : existing.display_name,
        description:
          payload.description !== undefined
            ? payload.description
            : existing.description,
        value_type:
          payload.value_type !== undefined
            ? payload.value_type
            : existing.value_type,
        enforcement_mode:
          payload.enforcement_mode !== undefined
            ? payload.enforcement_mode
            : existing.enforcement_mode,
        is_active:
          payload.is_active !== undefined
            ? payload.is_active
            : existing.is_active,
        updated_at: new Date(),
      })
      .where(eq(feature_definitions.id, id))
      .returning()
      .catch((error) => {
        throw new InternalServerErrorException(
          'Failed to update feature definition',
          {
            cause: error,
          },
        );
      });

    return updated;
  }

  async deleteFeatureDefinition(id: string) {
    const existing = await this.db.query.feature_definitions
      .findFirst({
        where: eq(feature_definitions.id, id),
      })
      .catch((error) => {
        throw new InternalServerErrorException(
          'Failed to fetch feature definition details',
          {
            cause: error,
          },
        );
      });
    if (!existing) {
      throw new NotFoundException(
        `Feature definition with ID '${id}' not found.`,
      );
    }

    await this.db
      .delete(feature_definitions)
      .where(eq(feature_definitions.id, id))
      .catch((error) => {
        throw new InternalServerErrorException(
          'Failed to delete feature definition',
          {
            cause: error,
          },
        );
      });

    return { success: true };
  }
}
