import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator.js';
import { ALLOW_CLEANUP_KEY } from '../common/decorators/allow-cleanup.decorator.js';
import { UserStatus } from '../drizzle/types/types.js';
import { Role } from '../enums/role.enum.js';

@Injectable()
export class VendorActiveGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const allowCleanup = this.reflector.getAllAndOverride<boolean>(
      ALLOW_CLEANUP_KEY,
      [context.getHandler(), context.getClass()],
    );
    const request = context.switchToHttp().getRequest();
    if (allowCleanup && request.isCleanupAllowed) {
      return true;
    }

    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not found in request');
    }

    // Only apply this check to vendors
    if (user.role === Role.VENDOR) {
      if (user.vendor_status !== UserStatus.ACTIVE) {
        throw new ForbiddenException(
          'Your vendor account is currently pending approval. Full access is restricted.',
        );
      }
    }

    return true;
  }
}
