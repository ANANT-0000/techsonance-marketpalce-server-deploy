import { Module } from '@nestjs/common';
import { OrderEligibilityGuardService } from './order-eligibility-guard.service.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';

/**
 * OrderEligibilityGuardModule
 *
 * Provides and exports OrderEligibilityGuardService so any feature module
 * (ReturnsModule, OrdersModule, etc.) can import this module and inject the
 * guard without re-declaring it.
 *
 * Usage in a feature module:
 *   imports: [..., OrderEligibilityGuardModule]
 *   // Then inject: private readonly guardService: OrderEligibilityGuardService
 */
@Module({
  imports: [DrizzleModule],
  providers: [OrderEligibilityGuardService],
  exports: [OrderEligibilityGuardService],
})
export class OrderEligibilityGuardModule {}
