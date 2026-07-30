import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator.js';
import { ROLES_KEY } from '../common/decorators/roles.decorator.js';
import { ALLOW_CLEANUP_KEY } from '../common/decorators/allow-cleanup.decorator.js';

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    // 1. Check for the public route bypass
    const skipAuthGuard = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skipAuthGuard) return true;
    const request = context.switchToHttp().getRequest();
    // 1.5 Check for allow cleanup bypass
    const allowCleanup = this.reflector.getAllAndOverride<boolean>(
      ALLOW_CLEANUP_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowCleanup && request.headers['cleanup-token'] === 'true') {
      return true;
    }

    // 2. Get the required roles for this route
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles) return true; // If no specific roles required, let them in

    const user = request.user; // Attached by JwtAuthGuard!
    // 3. Verify user and role
    if (!user || !user.role) {
      throw new ForbiddenException('User role not found in token');
    }
    // 4. Match role
    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied. Required roles: ${requiredRoles.join(', ')}`,
      );
    }
    return true;
  }
}
