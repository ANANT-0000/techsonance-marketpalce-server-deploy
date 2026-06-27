import {
  Controller,
  Get,
  Req,
  Inject,
  Logger,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { and, eq, lt } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../../drizzle/drizzle.module';
import { outbox_jobs } from '../../../drizzle/schema';
import { OutboxService } from '../outbox.service';
import { Public } from '../../../common/decorators/public.decorator';
import { OUTBOX_CONSTANTS, OutboxJobStatus } from '../constants/outbox.constants';

@Controller({
  version: OUTBOX_CONSTANTS.INTERNAL_VERSION,
  path: OUTBOX_CONSTANTS.INTERNAL_PATH,
})
export class OutboxSweeperController {
  private readonly logger = new Logger(OutboxSweeperController.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly outboxService: OutboxService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Get(OUTBOX_CONSTANTS.ROUTE_SWEEP_OUTBOX)
  @HttpCode(HttpStatus.OK)
  async sweepOutbox(@Req() req: Request) {
    const authHeader = req.headers[OUTBOX_CONSTANTS.HEADER_AUTHORIZATION];
    const expectedSecret = this.configService.get<string>('INTERNAL_CRON_SECRET');

    if (!expectedSecret) {
      this.logger.error('INTERNAL_CRON_SECRET is not configured.');
      throw new UnauthorizedException('Cron secret is not configured on server');
    }

    if (authHeader !== `Bearer ${expectedSecret}`) {
      this.logger.warn('Unauthorized sweep attempt rejected.');
      throw new UnauthorizedException('Invalid cron secret');
    }

    const oneMinuteAgo = new Date(Date.now() - OUTBOX_CONSTANTS.STALE_JOB_THRESHOLD_MS);

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
        this.logger.error('Sweeper failed to query pending jobs from database', err);
        return [];
      });

    if (pendingJobs.length === 0) {
      return { sweptCount: 0, message: 'No stale jobs found' };
    }

    this.logger.log(`Sweeper found ${pendingJobs.length} stale PENDING jobs. Re-publishing...`);

    // Re-publish each job to QStash
    const results = await Promise.allSettled(
      pendingJobs.map((job) => this.outboxService.publishShiprocketJob(job.id)),
    );

    const successful = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    this.logger.log(`Sweeper results: ${successful} succeeded, ${failed} failed.`);

    return {
      sweptCount: pendingJobs.length,
      successful,
      failed,
    };
  }
}
