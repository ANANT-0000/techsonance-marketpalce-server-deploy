import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SubscriptionService } from './subscription.service';
import { MailService } from '../../common/services/mail/mail.service';

@Injectable()
export class SubscriptionCron {
  private readonly logger = new Logger(SubscriptionCron.name);

  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly mailService: MailService,
  ) {}

  // Runs every 6 hours — moves expired trials to grace_period
  @Cron('0 */6 * * *')
  async handleTrialExpiry() {
    this.logger.log('Running trial expiry check...');
    const expiredIds = await this.subscriptionService.expireTrials();
    this.logger.log(`Moved ${expiredIds.length} trial(s) to grace_period`);

    for (const companyId of expiredIds) {
      await this.mailService
        .sendTrialExpiredEmail(companyId)
        .catch((e) =>
          this.logger.error(`Failed to send expiry email for ${companyId}`, e),
        );
    }
  }

  // Runs every 6 hours — finalizes grace periods
  @Cron('30 */6 * * *')
  async handleGracePeriodExpiry() {
    const finalizedIds =
      await this.subscriptionService.finalizeExpiredGracePeriods();
    this.logger.log(`Finalized ${finalizedIds.length} grace period(s)`);
  }

  // Runs daily at 9am — sends reminder emails
  @Cron('0 9 * * *')
  async sendTrialReminders() {
    const reminderDays = [7, 3, 1] as const;

    for (const days of reminderDays) {
      const subs = await this.subscriptionService.getTrialsEndingInDays(days);

      for (const sub of subs) {
        await this.mailService
          .sendTrialReminderEmail(sub.company_id, days)
          .catch((e) =>
            this.logger.error(
              `Failed reminder email for ${sub.company_id} (${days}d)`,
              e,
            ),
          );
      }

      this.logger.log(
        `Sent ${subs.length} reminder email(s) for ${days}-day warning`,
      );
    }
  }
}
