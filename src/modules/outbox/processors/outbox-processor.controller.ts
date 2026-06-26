import {
  Controller,
  Post,
  Req,
  Inject,
  Logger,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
  Body,
  HttpException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Receiver } from '@upstash/qstash';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../../drizzle/drizzle.module';
import { outbox_jobs } from '../../../drizzle/schema';
import { ShippingManagerService } from '../../shipping/shipping-manager.service';
import { Public } from '../../../common/decorators/public.decorator';
import { OUTBOX_CONSTANTS, OutboxJobStatus } from '../constants/outbox.constants';

@Controller({
  version: OUTBOX_CONSTANTS.INTERNAL_VERSION,
  path: OUTBOX_CONSTANTS.INTERNAL_PATH,
})
export class OutboxProcessorController {
  private readonly logger = new Logger(OutboxProcessorController.name);
  private readonly receiver: Receiver | null = null;

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly shippingManagerService: ShippingManagerService,
    private readonly configService: ConfigService,
  ) {
    const currentSigningKey = this.configService.get<string>('QSTASH_CURRENT_SIGNING_KEY');
    const nextSigningKey = this.configService.get<string>('QSTASH_NEXT_SIGNING_KEY');

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

  @Public()
  @Post(OUTBOX_CONSTANTS.ROUTE_PROCESS_SHIPMENT)
  @HttpCode(HttpStatus.OK)
  async processShipment(@Req() req: Request, @Body() body: { outboxId: string }) {
    const signature = req.headers[OUTBOX_CONSTANTS.HEADER_UPSTASH_SIGNATURE] as string;
    const outboxId = body?.outboxId;

    if (!outboxId) {
      throw new UnauthorizedException('Missing outboxId in request body');
    }

    // Verify signature if receiver is configured
    if (this.receiver) {
      if (!signature) {
        this.logger.error(`Missing ${OUTBOX_CONSTANTS.HEADER_UPSTASH_SIGNATURE} header`);
        throw new UnauthorizedException(`Missing ${OUTBOX_CONSTANTS.HEADER_UPSTASH_SIGNATURE} header`);
      }

      // Retrieve raw body from NestJS request options
      const rawBody = (req as any).rawBody;
      if (!rawBody) {
        this.logger.error(
          'rawBody is missing from request. Ensure { rawBody: true } is configured in NestFactory.create()',
        );
        throw new UnauthorizedException('Signature verification failed: raw body missing');
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
        throw new UnauthorizedException(`Signature verification failed: ${err.message}`);
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
      await this.shippingManagerService.createDraftOrderForOrder(orderId, companyId);

      // Mark status as COMPLETED
      await this.db
        .update(outbox_jobs)
        .set({ status: OutboxJobStatus.COMPLETED, updated_at: new Date() })
        .where(eq(outbox_jobs.id, outboxId));

      this.logger.log(`Outbox job ${outboxId} completed successfully.`);
      return { success: true };
    } catch (err: any) {
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
}
