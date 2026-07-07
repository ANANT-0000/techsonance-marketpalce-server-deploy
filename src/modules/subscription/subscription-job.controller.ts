import {
  Controller,
  Post,
  Req,
  Logger,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Receiver } from '@upstash/qstash';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/decorators/public.decorator.js';
import { SubscriptionService } from './subscription.service.js';
import { MailService } from '../../common/services/mail/mail.service.js';
import { SUBSCRIPTION_JOB_CONSTANTS } from './constants/subscription-job.constants.js';

import { GatewaySyncService } from './gateway-sync.service.js';

@Controller({
  version: SUBSCRIPTION_JOB_CONSTANTS.INTERNAL_VERSION,
  path: SUBSCRIPTION_JOB_CONSTANTS.INTERNAL_PATH,
})
export class SubscriptionJobController {
  private readonly logger = new Logger(SubscriptionJobController.name);
  private readonly receiver: Receiver | null = null;

  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly gatewaySyncService: GatewaySyncService,
  ) {
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
        'QSTASH_CURRENT_SIGNING_KEY not configured — QStash signature verification will be bypassed.',
      );
    }
  }

  // ─── Shared signature verification ────────────────────────────────────────

  private async verifySignature(req: Request): Promise<void> {
    if (!this.receiver) return;

    const signature = req.headers[
      SUBSCRIPTION_JOB_CONSTANTS.HEADER_UPSTASH_SIGNATURE
    ] as string;
    if (!signature) {
      throw new UnauthorizedException(
        `Missing ${SUBSCRIPTION_JOB_CONSTANTS.HEADER_UPSTASH_SIGNATURE} header`,
      );
    }

    const rawBody = (req as any).rawBody;
    if (!rawBody) {
      throw new UnauthorizedException(
        'Signature verification failed: raw body missing',
      );
    }

    try {
      const isValid = await this.receiver.verify({
        signature,
        body: rawBody.toString('utf-8'),
      });

      if (!isValid) {
        throw new UnauthorizedException('Invalid QStash signature');
      }
    } catch (err: any) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException(
        `Signature verification failed: ${err.message}`,
      );
    }
  }

  // ─── Endpoint 1: Expire Trials ─────────────────────────────────────────────
  // QStash Schedule: 0 */6 * * *

  @Public()
  @Post(SUBSCRIPTION_JOB_CONSTANTS.ROUTE_EXPIRE_TRIALS)
  @HttpCode(HttpStatus.OK)
  async expireTrials(@Req() req: Request) {
    await this.verifySignature(req);

    try {
      const expiredCompanyIds = await this.subscriptionService.expireTrials();
      this.logger.log(
        `Trial expiry: moved ${expiredCompanyIds.length} trial(s) to grace_period`,
      );

      // Send expiry emails (best-effort within the serverless invocation)
      for (const companyId of expiredCompanyIds) {
        await this.mailService
          .sendTrialExpiredEmail(companyId)
          .catch((e) =>
            this.logger.error(
              `Failed to send trial expiry email for company ${companyId}`,
              e,
            ),
          );
      }

      return { success: true, expiredCount: expiredCompanyIds.length };
    } catch (err: any) {
      this.logger.error(`expire-trials job failed: ${err.message}`, err.stack);
      throw new HttpException(
        `expire-trials failed: ${err.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ─── Endpoint 2: Finalize Grace Periods ────────────────────────────────────
  // QStash Schedule: 30 */6 * * *

  @Public()
  @Post(SUBSCRIPTION_JOB_CONSTANTS.ROUTE_FINALIZE_GRACE)
  @HttpCode(HttpStatus.OK)
  async finalizeGracePeriods(@Req() req: Request) {
    await this.verifySignature(req);

    try {
      const finalizedIds =
        await this.subscriptionService.finalizeExpiredGracePeriods();
      this.logger.log(
        `Grace period finalization: finalized ${finalizedIds.length} subscription(s)`,
      );
      return { success: true, finalizedCount: finalizedIds.length };
    } catch (err: any) {
      this.logger.error(
        `finalize-grace-periods job failed: ${err.message}`,
        err.stack,
      );
      throw new HttpException(
        `finalize-grace-periods failed: ${err.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ─── Endpoint 3: Send Trial Reminder Emails ────────────────────────────────
  // QStash Schedule: 0 9 * * *

  @Public()
  @Post(SUBSCRIPTION_JOB_CONSTANTS.ROUTE_SEND_REMINDERS)
  @HttpCode(HttpStatus.OK)
  async sendTrialReminders(@Req() req: Request) {
    await this.verifySignature(req);

    try {
      const reminderDays = [7, 3, 1] as const;
      const summary: Record<number, number> = {};

      for (const days of reminderDays) {
        const subs = await this.subscriptionService.getTrialsEndingInDays(days);
        summary[days] = subs.length;

        for (const sub of subs) {
          await this.mailService
            .sendTrialReminderEmail(sub.company_id, days)
            .catch((e) =>
              this.logger.error(
                `Failed to send ${days}-day reminder email for company ${sub.company_id}`,
                e,
              ),
            );
        }

        this.logger.log(
          `Sent ${subs.length} reminder email(s) for ${days}-day warning`,
        );
      }

      return { success: true, summary };
    } catch (err: any) {
      this.logger.error(`send-reminders job failed: ${err.message}`, err.stack);
      throw new HttpException(
        `send-reminders failed: ${err.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  // ─── Endpoint 4: Sync CMS Plan to Gateway ──────────────────────────────────
  // Triggered dynamically by CmsSubscriptionService via QStash when a plan is published

  @Public()
  @Post('subscription-sync')
  @HttpCode(HttpStatus.OK)
  async syncSubscriptionPlan(@Req() req: Request) {
    await this.verifySignature(req);
    try {
      // The body contains the payload sent from `publishJSON`
      const rawBody = (req as any).rawBody;
      const body = JSON.parse(rawBody.toString('utf-8'));

      const { planId, jobId } = body;

      if (!planId || !jobId) {
        throw new HttpException(
          'Missing planId or jobId in payload',
          HttpStatus.BAD_REQUEST,
        );
      }

      await this.gatewaySyncService.syncPlanToGateway(planId, jobId);

      return { success: true };
    } catch (err: any) {
      this.logger.error(
        `subscription-sync job failed: ${err.message}`,
        err.stack,
      );
      throw new HttpException(
        `subscription-sync failed: ${err.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
