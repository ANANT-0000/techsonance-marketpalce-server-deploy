import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessCheckService } from '../access-check.service.js';
import {
  FEATURE_KEY_METADATA,
  RequireFeatureOptions,
} from '../decorators/require-feature.decorator.js';
import { AccessDecision } from '../types/access-decision.js';

@Injectable()
export class FeatureAccessGuard implements CanActivate {
  private readonly logger = new Logger(FeatureAccessGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly accessCheck: AccessCheckService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.get<{ featureKey: string } & RequireFeatureOptions>(
      FEATURE_KEY_METADATA,
      context.getHandler(),
    );
    if (!meta) return true; // route doesn't declare @RequireFeature — nothing to enforce

    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    // Expects JwtAuthGuard/RoleGuard to have already run and attached req.user
    this.logger.debug(`Evaluating feature access for key: "${meta.featureKey}". Request user object: ${JSON.stringify(req.user)}`);

    const companyId: string | undefined = req.user?.companyId || req.user?.company_id;
    if (!companyId) {
      this.logger.warn(`Blocked feature access to "${meta.featureKey}": No authenticated company context (companyId is missing from req.user).`);
      throw new ForbiddenException('No authenticated company context for feature check.');
    }

    const decision: AccessDecision = meta.consume
      ? await this.accessCheck.checkAndConsume(companyId, meta.featureKey, meta.amount)
      : await this.accessCheck.check(companyId, meta.featureKey);

    if (decision.allowed) {
      this.logger.debug(`Allowed feature access to "${meta.featureKey}" for company "${companyId}".`);
      return true;
    }

    this.logger.warn(`Blocked feature access to "${meta.featureKey}" for company "${companyId}". Reason: ${decision.reason}`);

    res?.setHeader?.('X-Feature-Key', meta.featureKey);
    if (decision.limit !== undefined) res?.setHeader?.('X-Feature-Limit', String(decision.limit));
    if (decision.currentUsage !== undefined) res?.setHeader?.('X-Feature-Used', String(decision.currentUsage));

    if (decision.reason === 'quota_exceeded' && decision.retryAfterSeconds !== undefined) {
      res?.setHeader?.('Retry-After', String(decision.retryAfterSeconds));
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `Quota exceeded for "${meta.featureKey}".`,
          reason: decision.reason,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    throw new HttpException(
      {
        statusCode: HttpStatus.FORBIDDEN,
        error: 'Forbidden',
        message: this.messageFor(decision, meta.featureKey),
        reason: decision.reason,
      },
      HttpStatus.FORBIDDEN,
    );
  }

  private messageFor(decision: AccessDecision, featureKey: string): string {
    switch (decision.reason) {
      case 'no_subscription':
        return 'No active subscription found for this account.';
      case 'feature_disabled':
        return `Your current plan does not include "${featureKey}". Upgrade to unlock this.`;
      case 'quota_exceeded':
        return decision.isOverLimit
          ? `You're over your plan's limit for "${featureKey}". Remove existing items or upgrade your plan.`
          : `You've reached your plan's limit for "${featureKey}". Upgrade to continue.`;
      case 'unknown_feature':
        return `"${featureKey}" is not a recognized feature.`;
      default:
        return `Access denied for "${featureKey}".`;
    }
  }
}
