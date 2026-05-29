import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriptionService } from './subscription.service';

export const SKIP_SUBSCRIPTION = 'skip_subscription';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Allow routes decorated with @SkipSubscription()
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_SUBSCRIPTION, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const request = context.switchToHttp().getRequest();
    const companyId: string | undefined = request.user?.company_id;
    if (!companyId) return true; // no company context = public route

    const status =
      await this.subscriptionService.getSubscriptionStatus(companyId);

    if (!status) return true; // no subscription row yet = let through

    // Hard block only after grace period has fully ended
    if (status.is_expired) {
      throw new HttpException(
        {
          statusCode: 402,
          error: 'Subscription expired',
          message: 'Your trial has ended. Please upgrade to continue.',
          upgrade_url: '/settings/billing',
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    // Attach subscription context to request for controllers to use
    request.subscription = status;
    return true;
  }
}
