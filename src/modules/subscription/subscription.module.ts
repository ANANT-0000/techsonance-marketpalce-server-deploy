import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionCron } from './subscription.cron';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { MailModule } from '../../common/services/mail/mail.module';
import { SubscriptionGuard } from './subscription.guard';

@Module({
  imports: [DrizzleModule, MailModule, ScheduleModule.forRoot()],
  controllers: [SubscriptionController],
  providers: [SubscriptionService, SubscriptionGuard, SubscriptionCron],
  exports: [SubscriptionService, SubscriptionGuard],
})
export class SubscriptionModule {}
