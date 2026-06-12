// ../../modules/subscription/subscription.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import { Inject } from '@nestjs/common';
import { vendor_subscriptions } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { SKIP_SUBSCRIPTION_KEY } from '../../common/decorators/skip-subscription.decorator';
import { SubscriptionStatus, UserRole } from '../../drizzle/types/types';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @Inject(DRIZZLE) private db: DrizzleService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Skip routes decorated with @SkipSubscription()
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_SUBSCRIPTION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // 2. No user yet — JwtAuthGuard hasn't run or route is public
    //    Let JwtAuthGuard handle the 401; not our concern here
    if (!user) return true;

    // 3. Customers don't have subscriptions — only check vendors
    //    Adjust the role name to match your Role enum
    if (user.role !== UserRole.VENDOR) return true;

    // 4. company_id must be in the JWT payload
    const companyId = user.company_id; // ← comes from JWT, set at login
    if (!companyId)
      throw new ForbiddenException('No company associated with this account');

    // 5. Query the subscription fresh from DB
    const [subscription] = await this.db
      .select({
        status: vendor_subscriptions.status,
        grace_period_ends_at: vendor_subscriptions.grace_period_ends_at,
        trial_ends_at: vendor_subscriptions.trial_ends_at,
      })
      .from(vendor_subscriptions)
      .where(eq(vendor_subscriptions.company_id, companyId))
      .limit(1);

    // 6. No subscription row at all — vendor was never onboarded properly
    if (!subscription) {
      throw new ForbiddenException('No active subscription found');
    }

    const { status, grace_period_ends_at, trial_ends_at } = subscription;

    // 7. ACTIVE — always allowed
    if (status === SubscriptionStatus.ACTIVE) return true;

    // 8. TRIAL — allowed until trial_ends_at
    if (status === SubscriptionStatus.TRIAL) {
      if (!trial_ends_at || new Date() <= new Date(trial_ends_at)) return true;
      throw new ForbiddenException(
        'Your trial has expired. Please select a plan.',
      );
    }

    // 9. GRACE_PERIOD — allowed until grace window closes
    if (status === SubscriptionStatus.GRACE_PERIOD) {
      if (
        grace_period_ends_at &&
        new Date() <= new Date(grace_period_ends_at)
      ) {
        return true;
      }
      throw new ForbiddenException(
        'Your grace period has ended. Please renew your subscription.',
      );
    }

    // 10. CANCELLED, EXPIRED, or anything else
    throw new ForbiddenException(
      'Your subscription is inactive. Please renew to continue.',
    );
  }
}
