import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
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

  constructor(@Inject(DRIZZLE) private db: DrizzleService) {}

  /**
   * Idempotently syncs a plan's prices to the Payment Gateway (Stripe/Paddle).
   */
  async syncPlanToGateway(
    planId: string,
    idempotencyKey: string,
  ): Promise<void> {
    this.logger.log(
      `Starting sync for plan ${planId} with idempotency key ${idempotencyKey}`,
    );

    // 1. Fetch the job and verify it's still pending (idempotency check)
    const job = await this.db.query.cms_sync_jobs.findFirst({
      where: eq(cms_sync_jobs.idempotency_key, idempotencyKey),
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

    // 2. Fetch the live plan and its pending prices
    const plan = await this.db.query.cms_plans.findFirst({
      where: eq(cms_plans.id, planId),
      with: {
        prices: {
          where: eq(cms_plan_prices.sync_status, SyncStatus.PENDING),
        },
      },
    });

    if (!plan || plan.prices.length === 0) {
      this.logger.log(`No pending prices found to sync for plan ${planId}.`);
      await this.db
        .update(cms_sync_jobs)
        .set({ status: JobStatus.COMPLETED })
        .where(eq(cms_sync_jobs.id, job.id));
      return;
    }

    try {
      // 3. Mark job as processing
      await this.db
        .update(cms_sync_jobs)
        .set({ status: JobStatus.PROCESSING, attempts: job.attempts + 1 })
        .where(eq(cms_sync_jobs.id, job.id));

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
          .where(eq(cms_plan_prices.id, price.id));
      }

      // 5. Mark job as completed
      await this.db
        .update(cms_sync_jobs)
        .set({
          status: JobStatus.COMPLETED,
          gateway_response_json: simulatedGatewayResponses,
        })
        .where(eq(cms_sync_jobs.id, job.id));

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
        .where(eq(cms_sync_jobs.id, job.id));
      throw error;
    }
  }
}
