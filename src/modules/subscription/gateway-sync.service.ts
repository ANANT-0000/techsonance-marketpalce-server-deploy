import { Injectable, Inject, Logger, InternalServerErrorException } from '@nestjs/common';
import { eq, or, and, lt, ne } from 'drizzle-orm';
import { ConfigService } from '@nestjs/config';
import { Client } from '@upstash/qstash';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module.js';
import {
  cms_plans,
  cms_plan_prices,
  cms_sync_jobs,
} from '../../drizzle/schema/subscription.schema.js';
import { JobStatus, SyncStatus } from '../../drizzle/types/types.js';

@Injectable()
export class GatewaySyncService {
  private readonly logger = new Logger(GatewaySyncService.name);
  private readonly qstashClient: Client;
  private readonly callbackBaseUrl: string;

  constructor(
    @Inject(DRIZZLE) private db: DrizzleService,
    private readonly configService: ConfigService,
  ) {
    const qstashToken = this.configService.get<string>('QSTASH_TOKEN');
    const callbackBaseUrl =
      this.configService.get<string>('QSTASH_CALLBACK_BASE_URL') ||
      this.configService.get<string>('PUBLIC_API_URL');

    if (!qstashToken) {
      throw new Error('QSTASH_TOKEN must be configured for GatewaySyncService');
    }

    if (!callbackBaseUrl) {
      throw new Error(
        'PUBLIC_API_URL or QSTASH_CALLBACK_BASE_URL must be configured for GatewaySyncService',
      );
    }

    this.qstashClient = new Client({ token: qstashToken });
    this.callbackBaseUrl = callbackBaseUrl;
  }

  /**
   * Idempotently syncs a plan's prices to the Payment Gateway (Stripe/Paddle).
   */
  async syncPlanToGateway(
    planId: string,
    idempotencyKey: string,
    force: boolean = false,
  ): Promise<void> {
    this.logger.log(
      `Starting sync for plan ${planId} with idempotency key ${idempotencyKey}${force ? ' (forced retry)' : ''}`,
    );

    // 1. Fetch the job and verify it's still pending (idempotency check)
    const job = await this.db.query.cms_sync_jobs.findFirst({
      where: eq(cms_sync_jobs.idempotency_key, idempotencyKey),
    }).catch((error) => {
      throw new InternalServerErrorException('Failed to fetch sync job details', {
        cause: error,
      });
    });

    if (!job) {
      this.logger.error(
        `Sync job not found for idempotency key: ${idempotencyKey}`,
      );
      return;
    }

    if (job.status === JobStatus.COMPLETED) {
      this.logger.log(`Job ${idempotencyKey} already completed. Skipping.`);
      return;
    }

    if (job.status === JobStatus.PROCESSING && !force) {
      this.logger.log(`Job ${idempotencyKey} is already processing. Skipping.`);
      return;
    }

    // Atomically claim the job before any gateway work
    const claimConditions = force
      ? eq(cms_sync_jobs.id, job.id)
      : and(
          eq(cms_sync_jobs.id, job.id),
          ne(cms_sync_jobs.status, JobStatus.PROCESSING),
        );

    const [updatedJobs] = await this.db
      .update(cms_sync_jobs)
      .set({ status: JobStatus.PROCESSING, attempts: job.attempts + 1 })
      .where(claimConditions)
      .returning({ id: cms_sync_jobs.id })
      .catch((error) => {
        throw new InternalServerErrorException('Failed to claim sync job', {
          cause: error,
        });
      });

    if (!updatedJobs || !updatedJobs.id) {
      this.logger.log(`Job ${idempotencyKey} is already processing. Skipping.`);
      return;
    }

    // 2. Fetch the live plan and its pending prices
    const plan = await this.db.query.cms_plans.findFirst({
      where: eq(cms_plans.id, planId),
      with: {
        prices: {
          where: eq(cms_plan_prices.sync_status, SyncStatus.PENDING),
        },
      },
    }).catch((error) => {
      throw new InternalServerErrorException('Failed to fetch plan prices for sync', {
        cause: error,
      });
    });

    if (!plan || plan.prices.length === 0) {
      this.logger.log(`No pending prices found to sync for plan ${planId}.`);
      await this.db
        .update(cms_sync_jobs)
        .set({ status: JobStatus.COMPLETED })
        .where(eq(cms_sync_jobs.id, job.id))
        .catch((error) => {
          throw new InternalServerErrorException('Failed to complete empty sync job', {
            cause: error,
          });
        });
      return;
    }

    try {
      // 3. Job is already marked as processing

      const simulatedGatewayResponses = [];

      // 4. MOCK: Call Stripe/Paddle API for each pending price
      for (const price of plan.prices) {
        // Pseudo-code for Gateway API call:
        // const stripePrice = await stripe.prices.create({
        //   unit_amount: price.amount_cents,
        //   currency: price.currency,
        //   recurring: { interval: price.interval },
        //   product: plan.plan_key,
        // }, { idempotencyKey: `${idempotencyKey}-${price.id}` });

        // Mocking a successful response from Stripe:
        const mockGatewayPriceId = `price_mock_${Math.random().toString(36).substr(2, 9)}`;
        simulatedGatewayResponses.push({
          id: mockGatewayPriceId,
          amount: price.amount_minor_units,
        });

        // Update price row with gateway ID and mark synced
        await this.db
          .update(cms_plan_prices)
          .set({
            gateway_price_id: mockGatewayPriceId,
            sync_status: SyncStatus.SYNCED,
          })
          .where(eq(cms_plan_prices.id, price.id))
          .catch((error) => {
            throw new InternalServerErrorException('Failed to update plan price sync status', {
              cause: error,
            });
          });
      }

      // 5. Mark job as completed
      await this.db
        .update(cms_sync_jobs)
        .set({
          status: JobStatus.COMPLETED,
          gateway_response_json: simulatedGatewayResponses,
        })
        .where(eq(cms_sync_jobs.id, job.id))
        .catch((error) => {
          throw new InternalServerErrorException('Failed to complete sync job', {
            cause: error,
          });
        });

      this.logger.log(`Successfully synced plan ${planId} to gateway.`);
    } catch (error: any) {
      this.logger.error(
        `Failed to sync plan ${planId} to gateway`,
        error.stack,
      );
      // Mark job as failed
      await this.db
        .update(cms_sync_jobs)
        .set({
          status: JobStatus.FAILED,
          last_error: error.message,
        })
        .where(eq(cms_sync_jobs.id, job.id))
        .catch((dbError) => {
          throw new InternalServerErrorException('Failed to update sync job failure status', {
            cause: dbError,
          });
        });
      throw error;
    }
  }

  /**
   * Fan-out pattern: queries all failed/stuck sync jobs and publishes one
   * individual QStash message per job to the subscription-sync endpoint.
   * Returns immediately — Vercel will handle each job in its own short invocation.
   * Used by the sweep-syncs cron endpoint (replaces the sequential loop).
   */
  async enqueueSweepJobs(): Promise<number> {
    this.logger.log(
      'Sweep: querying for failed/stuck sync jobs to re-enqueue...',
    );

    const thresholdDate = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago

    const jobs = await this.db.query.cms_sync_jobs.findMany({
      where: and(
        or(
          eq(cms_sync_jobs.status, JobStatus.PENDING),
          eq(cms_sync_jobs.status, JobStatus.PROCESSING),
          eq(cms_sync_jobs.status, JobStatus.FAILED),
        ),
        lt(cms_sync_jobs.attempts, 5),
        lt(cms_sync_jobs.updated_at, thresholdDate),
      ),
      limit: 50,
    }).catch((error) => {
      throw new InternalServerErrorException('Failed to fetch stuck sync jobs', {
        cause: error,
      });
    });

    if (jobs.length === 0) {
      this.logger.log('Sweep: no failed/stuck jobs found. Nothing to enqueue.');
      return 0;
    }

    this.logger.log(
      `Sweep: found ${jobs.length} job(s) to re-enqueue individually via QStash.`,
    );

    const callbackUrl = `${this.callbackBaseUrl}/api/v1/internal/subscription/subscription-sync`;
    let enqueuedCount = 0;

    const concurrencyLimit = 10;
    for (let i = 0; i < jobs.length; i += concurrencyLimit) {
      const batch = jobs.slice(i, i + concurrencyLimit);
      await Promise.all(
        batch.map(async (job) => {
          try {
            await this.qstashClient.publishJSON({
              url: callbackUrl,
              body: {
                jobId: job.idempotency_key,
                planId: job.plan_id,
                force: true,
              },
            });
            enqueuedCount++;
            this.logger.log(
              `Sweep: enqueued job ${job.idempotency_key} for plan ${job.plan_id}.`,
            );
          } catch (err: any) {
            this.logger.error(
              `Sweep: failed to enqueue job ${job.idempotency_key}: ${err.message}`,
            );
            // Continue with remaining jobs — don't let one failure abort the sweep
          }
        }),
      );
    }

    this.logger.log(
      `Sweep: enqueued ${enqueuedCount}/${jobs.length} job(s) successfully.`,
    );
    return enqueuedCount;
  }

  /**
   * Synchronously retries all failed/pending sync jobs in sequence.
   * NOTE: Only use in local development — this will timeout on Vercel Hobby (10s limit).
   * In production, use enqueueSweepJobs() instead.
   */
  async sweepFailedSyncs(): Promise<number> {
    this.logger.log('Starting sync job sweep...');
    const thresholdDate = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
    const jobs = await this.db.query.cms_sync_jobs.findMany({
      where: and(
        or(
          eq(cms_sync_jobs.status, JobStatus.PENDING),
          eq(cms_sync_jobs.status, JobStatus.PROCESSING),
          eq(cms_sync_jobs.status, JobStatus.FAILED),
        ),
        lt(cms_sync_jobs.attempts, 5),
        lt(cms_sync_jobs.updated_at, thresholdDate),
      ),
    }).catch((error) => {
      throw new InternalServerErrorException('Failed to fetch failed sync jobs', {
        cause: error,
      });
    });

    this.logger.log(
      `Found ${jobs.length} pending/failed/stuck sync jobs to retry.`,
    );
    let successCount = 0;

    for (const job of jobs) {
      try {
        await this.syncPlanToGateway(job.plan_id, job.idempotency_key, true);
        successCount++;
      } catch (err: any) {
        this.logger.error(
          `Failed to retry sync job ${job.idempotency_key}: ${err.message}`,
        );
      }
    }

    return successCount;
  }
}
