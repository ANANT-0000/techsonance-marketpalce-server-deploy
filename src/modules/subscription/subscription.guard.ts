import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SKIP_SUBSCRIPTION_KEY } from '../../common/decorators/skip-subscription.decorator.js';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator.js';
import { SubscriptionStatus, UserRole } from '../../drizzle/types/types.js';
import { EntitlementResolverService } from '../entitlements/entitlement-resolver.service.js';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly entitlementResolverService: EntitlementResolverService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Skip routes decorated with @SkipSubscription()
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_SUBSCRIPTION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip) return true;

    // Skip routes decorated with @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;

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

    // 5. Read the cached subscription from EntitlementResolverService
    const map = await this.entitlementResolverService.resolve(companyId).catch((error) => {
      throw new InternalServerErrorException('Failed to fetch subscription status details', {
        cause: error,
      });
    });

    const subscription = map.metadata;

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
