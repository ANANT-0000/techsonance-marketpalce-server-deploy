import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SubscriptionService } from './subscription.service.js';
import { SubscriptionController } from './subscription.controller.js';
import { SubscriptionJobController } from './subscription-job.controller.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';
import { MailModule } from '../../common/services/mail/mail.module.js';
import { SubscriptionGuard } from './subscription.guard.js';
import { CompanyModule } from '../company/company.module.js';
import { AuthModule } from '../auth/auth.module.js';

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

