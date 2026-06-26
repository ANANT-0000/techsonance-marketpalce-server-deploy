import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, Receiver } from '@upstash/qstash';
import {
  OUTBOX_CONSTANTS,
  OutboxJobStatus,
} from './constants/outbox.constants';
import { outbox_jobs } from 'src/drizzle/schema';
import { and, eq, lt } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from 'src/drizzle/drizzle.module';
import type { Request } from 'express';
import { ShippingManagerService } from '../shipping/shipping-manager.service';

@Injectable()
export class OutboxService {
  private readonly client: Client;
  private readonly callbackBaseUrl: string;
  private readonly receiver: Receiver;
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly shippingManagerService: ShippingManagerService,
    @Inject(DRIZZLE) private readonly db: DrizzleService,
  ) {
    const qstashToken = this.configService.get<string>('QSTASH_TOKEN');
    this.callbackBaseUrl =
      this.configService.get<string>('QSTASH_CALLBACK_BASE_URL') || '';

    if (!qstashToken) {
      this.logger.error(
        'QSTASH_TOKEN is not configured in environment variables.',
      );
    }

    this.client = new Client({
      token: qstashToken || '',
    });
    const currentSigningKey = this.configService.get<string>(
      'QSTASH_CURRENT_SIGNING_KEY',
    );
    const nextSigningKey = this.configService.get<string>(
      'QSTASH_NEXT_SIGNING_KEY',
    );

    if (currentSigningKey) {
      this.receiver = new Receiver({
        currentSigningKey,
        nextSigningKey: nextSigningKey || '',
      });
    } else {
      this.logger.warn(
        'QSTASH_CURRENT_SIGNING_KEY is not configured. QStash signature verification will be bypassed.',
      );
    }
  }
  /**
   * Processes a shipment draft order creation job triggered by an Upstash QStash webhook.
   *
   * This method handles the full lifecycle of an outbox job:
   * 1. **Security Verification**: Validates the Upstash signature if a receiver is configured.
   * 2. **Idempotency Check**: Skips processing if the job is already completed or not found.
   * 3. **Execution**: Calls the shipping manager to create a draft order.
   * 4. **Retry Policy**:
   *    - **401 Unauthorized**: Marks job as FAILED and returns 200 OK to stop further retries (permanent failure).
   *    - **Other Errors**: Increments retry count. If max retries exceeded, marks FAILED; otherwise marks PENDING and returns 500 to trigger a retry.
   *
   * @param req - The Express/NestJS request object, expected to contain headers and rawBody.
   * @param body - The request payload containing the job identifier.
   * @param body.outboxId - The unique ID of the outbox job to process.
   *
   * @returns A promise resolving to an object indicating success status.
   *  - `{ success: true }` on completion.
   *  - `{ success: false, reason: 'unauthorized_credentials' }` for 401 errors.
   *  - `{ success: false, message: '...' }` if job not found.
   *
   * @throws {UnauthorizedException} If the signature is missing, invalid, or rawBody is absent.
   * @throws {HttpException} (500) If a transient error occurs and retries remain, signaling QStash to retry.
   *
   * @example
   * // Triggered by QStash webhook
   * await processShipment(req, { outboxId: 'job-123' });
   */
  async processShipment(req: Request, body: { outboxId: string }) {
    const signature = req.headers[
      OUTBOX_CONSTANTS.HEADER_UPSTASH_SIGNATURE
    ] as string;
    const outboxId = body?.outboxId;

    if (!outboxId) {
      throw new UnauthorizedException('Missing outboxId in request body');
    }
    // Verify signature if receiver is configured
    if (this.receiver) {
      if (!signature) {
        this.logger.error(
          `Missing ${OUTBOX_CONSTANTS.HEADER_UPSTASH_SIGNATURE} header`,
        );
        throw new UnauthorizedException(
          `Missing ${OUTBOX_CONSTANTS.HEADER_UPSTASH_SIGNATURE} header`,
        );
      }

      /**
       * Retrieve raw body from NestJS request options
       */
      const rawBody = (req as any).rawBody;
      if (!rawBody) {
        this.logger.error(
          'rawBody is missing from request. Ensure { rawBody: true } is configured in NestFactory.create()',
        );
        throw new UnauthorizedException(
          'Signature verification failed: raw body missing',
        );
      }
      const rawBodyString = rawBody.toString('utf-8');

      try {
        const isValid = await this.receiver.verify({
          signature,
          body: rawBodyString,
        });

        if (!isValid) {
          this.logger.error('Invalid QStash signature');
          throw new UnauthorizedException('Invalid QStash signature');
        }
      } catch (err: any) {
        this.logger.error(`Signature verification failed: ${err.message}`);
        throw new UnauthorizedException(
          `Signature verification failed: ${err.message}`,
        );
      }
    }

    // Process job using the existing outbox job logic
    const [outboxJob] = await this.db
      .select()
      .from(outbox_jobs)
      .where(eq(outbox_jobs.id, outboxId))
      .limit(1);

    if (!outboxJob) {
      this.logger.warn(`Outbox job ${outboxId} not found — skipping.`);
      return { success: false, message: 'Outbox job not found' };
    }

    if (outboxJob.status === OutboxJobStatus.COMPLETED) {
      this.logger.log(`Outbox job ${outboxId} already COMPLETED — skipping.`);
      return { success: true, message: 'Already completed' };
    }

    // Mark status as PROCESSING
    await this.db
      .update(outbox_jobs)
      .set({ status: OutboxJobStatus.PROCESSING, updated_at: new Date() })
      .where(eq(outbox_jobs.id, outboxId));

    const { orderId, companyId } = outboxJob.payload as {
      orderId: string;
      companyId: string;
    };

    try {
      await this.shippingManagerService.createDraftOrderForOrder(
        orderId,
        companyId,
      );

      // Mark status as COMPLETED
      await this.db
        .update(outbox_jobs)
        .set({ status: OutboxJobStatus.COMPLETED, updated_at: new Date() })
        .where(eq(outbox_jobs.id, outboxId));

      return { success: true };
    } catch (err: any) {
      /**
       * 401 → permanent failure → stop retries
       * else → temporary failure → retry (up to max retry count)
       */
      const is401 =
        err?.status === HttpStatus.UNAUTHORIZED ||
        err?.statusCode === HttpStatus.UNAUTHORIZED ||
        err?.response?.statusCode === 401 ||
        err?.cause?.response?.statusCode === 401;

      if (is401) {
        // Mark status as FAILED in outbox_jobs so it is not retried locally, but do NOT throw 500.
        // Return 200 OK to QStash to stop retries.
        await this.db
          .update(outbox_jobs)
          .set({
            status: OutboxJobStatus.FAILED,
            error_message:
              err?.message ??
              'Shiprocket authentication failed (Circuit Breaker triggered)',
            updated_at: new Date(),
          })
          .where(eq(outbox_jobs.id, outboxId));

        return { success: false, reason: 'unauthorized_credentials' };
      }

      const newRetryCount = (outboxJob.retry_count ?? 0) + 1;
      const isFatal = newRetryCount >= OUTBOX_CONSTANTS.MAX_RETRY_COUNT;

      await this.db
        .update(outbox_jobs)
        .set({
          status: isFatal ? OutboxJobStatus.FAILED : OutboxJobStatus.PENDING,
          retry_count: newRetryCount,
          error_message: err?.message ?? 'Unknown error',
          updated_at: new Date(),
        })
        .where(eq(outbox_jobs.id, outboxId));

      this.logger.error(
        `Outbox job ${outboxId} failed (attempt ${newRetryCount}/${OUTBOX_CONSTANTS.MAX_RETRY_COUNT}): ${err?.message}`,
      );

      // Return a 500 error status so QStash knows the endpoint failed and retries according to policy
      throw new HttpException(
        `Outbox job execution failed: ${err?.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Publishes a message to QStash to trigger the background processing of a Shiprocket order sync.
   * QStash will call back POST /api/v1/internal/process-shipment
   */
  async publishShiprocketJob(outboxId: string): Promise<void> {
    if (!this.callbackBaseUrl) {
      this.logger.error(
        'QSTASH_CALLBACK_BASE_URL is not configured. Cannot publish QStash job.',
      );
      return;
    }

    // Dynamic URL generation using OUTBOX_CONSTANTS
    const callbackUrl = `${this.callbackBaseUrl}/api/v1/${OUTBOX_CONSTANTS.INTERNAL_PATH}/${OUTBOX_CONSTANTS.ROUTE_PROCESS_SHIPMENT}`;
    this.logger.log(
      `Publishing QStash job for outbox ID ${outboxId} targeting: ${callbackUrl}`,
    );

    try {
      await this.client.publishJSON({
        url: callbackUrl,
        body: { outboxId },
        retries: OUTBOX_CONSTANTS.DEFAULT_RETRY_LIMIT,
      });
      this.logger.log(
        `Successfully published outbox job ${outboxId} to QStash`,
      );
    } catch (err: any) {
      this.logger.error(
        `Failed to publish outbox job ${outboxId} to QStash: ${err?.message || err}`,
        err?.stack,
      );
    }
  }

  /**
   * Publishes a one-shot QStash job to deliver an email via the email processor endpoint.
   * QStash handles retries automatically. No outbox_jobs DB row is created.
   */
  async publishEmailJob(payload: {
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    if (!this.callbackBaseUrl) {
      this.logger.error(
        'QSTASH_CALLBACK_BASE_URL is not configured. Cannot publish email job.',
      );
      return;
    }

    const callbackUrl = `${this.callbackBaseUrl}/api/v1/${OUTBOX_CONSTANTS.INTERNAL_PATH}/${OUTBOX_CONSTANTS.ROUTE_PROCESS_EMAIL}`;

    try {
      await this.client.publishJSON({
        url: callbackUrl,
        body: payload,
        retries: OUTBOX_CONSTANTS.DEFAULT_RETRY_LIMIT,
      });
      this.logger.log(`Published email job to QStash (to: ${payload.to})`);
    } catch (err: any) {
      this.logger.error(
        `Failed to publish email job to QStash: ${err?.message || err}`,
        err?.stack,
      );
    }
  }
  /**
   * Sweeps stale outbox jobs and republishes them to QStash.
   *
   * This method is triggered by an internal cron job. It:
   * - Validates the request using a configured secret.
   * - Queries the database for PENDING outbox jobs older than the stale threshold.
   * - Attempts to re-publish each stale job to QStash.
   * - Aggregates and returns the number of jobs swept, successfully re-published, and failed.
   *
   * @param req - The incoming HTTP request containing the authorization header.
   * @returns An object with:
   *   - sweptCount: total number of stale jobs found
   *   - successful: number of jobs successfully re-published
   *   - failed: number of jobs that failed to re-publish
   *
   * @throws UnauthorizedException if the cron secret is missing or invalid.
   */
  async sweepOutbox(req: Request) {
    const authHeader = req.headers[OUTBOX_CONSTANTS.HEADER_AUTHORIZATION];
    const expectedSecret = this.configService.get<string>(
      'INTERNAL_CRON_SECRET',
    );

    if (!expectedSecret) {
      this.logger.error('INTERNAL_CRON_SECRET is not configured.');
      throw new UnauthorizedException(
        'Cron secret is not configured on server',
      );
    }

    if (authHeader !== `Bearer ${expectedSecret}`) {
      this.logger.warn('Unauthorized sweep attempt rejected.');
      throw new UnauthorizedException('Invalid cron secret');
    }

    const oneMinuteAgo = new Date(
      Date.now() - OUTBOX_CONSTANTS.STALE_JOB_THRESHOLD_MS,
    );

    // Fetch all stale PENDING outbox jobs
    const pendingJobs = await this.db
      .select({ id: outbox_jobs.id })
      .from(outbox_jobs)
      .where(
        and(
          eq(outbox_jobs.status, OutboxJobStatus.PENDING),
          lt(outbox_jobs.created_at, oneMinuteAgo),
        ),
      )
      .catch((err) => {
        this.logger.error(
          'Sweeper failed to query pending jobs from database',
          err,
        );
        return [];
      });

    if (pendingJobs.length === 0) {
      return { sweptCount: 0, message: 'No stale jobs found' };
    }

    this.logger.log(
      `Sweeper found ${pendingJobs.length} stale PENDING jobs. Re-publishing...`,
    );

    // Re-publish each job to QStash
    const results = await Promise.allSettled(
      pendingJobs.map((job) => this.publishShiprocketJob(job.id)),
    );

    const successful = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    this.logger.log(
      `Sweeper results: ${successful} succeeded, ${failed} failed.`,
    );

    return {
      sweptCount: pendingJobs.length,
      successful,
      failed,
    };
  }
}
