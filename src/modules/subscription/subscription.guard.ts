import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriptionService } from './subscription.service';
import { JwtService } from '@nestjs/jwt';
import { SetMetadata } from '@nestjs/common';

export const SKIP_SUBSCRIPTION = 'skip_subscription';
export const SkipSubscription = () => SetMetadata(SKIP_SUBSCRIPTION, true);

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Allow routes decorated with @SkipSubscription()
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_SUBSCRIPTION, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const request = context.switchToHttp().getRequest();

    // Try to get user from request (if JwtAuthGuard already ran)
    let user = request.user;

    // If not present, try to extract and verify JWT token from Authorization header
    if (!user) {
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
          const payload = await this.jwtService.verifyAsync(token, {
            secret: process.env.JWT_SECRET || 'default_secret',
          });
          if (payload) {
            user = {
              id: payload.sub,
              email: payload.email,
              role: payload.role,
              company_id: payload.company_id,
              password_change_required: payload.password_change_required,
            };
            request.user = user; // Attach to request for downstream handlers
          }
        } catch (err) {
          // Token is invalid/expired. Let JwtAuthGuard handle authentication failures.
        }
      }
    }

    // Only enforce subscription restrictions on vendors
    if (user?.role !== 'vendor') return true;

    const companyId: string | undefined = user?.company_id;
    if (!companyId) {
      throw new HttpException(
        'Company context is missing. Please sign in again.',
        HttpStatus.UNAUTHORIZED,
      );
    }

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
