import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionJobController } from './subscription-job.controller';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { MailModule } from '../../common/services/mail/mail.module';
import { SubscriptionGuard } from './subscription.guard';
import { CompanyModule } from '../company/company.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    DrizzleModule,
    MailModule,
    ConfigModule,
    forwardRef(() => CompanyModule),
    forwardRef(() => AuthModule),
  ],
  controllers: [SubscriptionController, SubscriptionJobController],
  providers: [SubscriptionService, SubscriptionGuard],
  exports: [SubscriptionService, SubscriptionGuard],
})
export class SubscriptionModule {}

