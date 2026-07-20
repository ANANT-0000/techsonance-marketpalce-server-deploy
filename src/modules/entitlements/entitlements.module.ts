import { Module } from '@nestjs/common';

import { DrizzleModule } from '../../drizzle/drizzle.module.js';
import { EntitlementResolverService } from './entitlement-resolver.service.js';
import { UsageTrackerService } from './usage-tracker.service.js';
import { AccessCheckService } from './access-check.service.js';
import { FeatureAccessGuard } from './guards/feature-access.guard.js';
import { EntitlementsController } from './entitlements.controller.js';

@Module({
  imports: [
    DrizzleModule,
  ],
  controllers: [EntitlementsController],
  providers: [
    EntitlementResolverService,
    UsageTrackerService,
    AccessCheckService,
    FeatureAccessGuard,
  ],
  // Exported so any other module (products, orders, vendors, etc.) can
  // @UseGuards(FeatureAccessGuard) or inject AccessCheckService directly
  // for non-HTTP checks (e.g. inside a QStash job handler).
  exports: [EntitlementResolverService, UsageTrackerService, AccessCheckService, FeatureAccessGuard],
})
export class EntitlementsModule {}
