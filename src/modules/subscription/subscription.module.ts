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

import { AdminSubscriptionController } from './admin-subscription.controller.js';
import { PublicSubscriptionController } from './public-subscription.controller.js';
import { CmsSubscriptionService } from './cms-subscription.service.js';
import { GatewaySyncService } from './gateway-sync.service.js';

@Module({
  imports: [
    DrizzleModule,
    MailModule,
    ConfigModule,
    forwardRef(() => CompanyModule),
    forwardRef(() => AuthModule),
  ],
  controllers: [
    SubscriptionController,
    SubscriptionJobController,
    AdminSubscriptionController,
    PublicSubscriptionController,
  ],
  providers: [SubscriptionService, SubscriptionGuard, CmsSubscriptionService, GatewaySyncService],
  exports: [SubscriptionService, SubscriptionGuard, CmsSubscriptionService, GatewaySyncService],
})
export class SubscriptionModule {}

