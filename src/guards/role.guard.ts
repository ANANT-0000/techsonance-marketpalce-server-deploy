import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    console.log('[RoleGuard.canActivate] Request received');
    // 1. Check for the public route bypass
    const skipAuthGuard = this.reflector.get<boolean>(
      'skipAuthGuard',
      context.getHandler(),
    );
    console.log('[RoleGuard.canActivate] skipAuthGuard:', skipAuthGuard);
    if (skipAuthGuard) return true;

    // 2. Get the required roles for this route
    const requiredRoles = this.reflector.get<string[]>(
      'roles',
      context.getHandler(),
    );
    console.log('[RoleGuard.canActivate] requiredRoles:', requiredRoles);
    if (!requiredRoles) return true; // If no specific roles required, let them in

    const request = context.switchToHttp().getRequest();
    // console.log("request", request)
    const user = request.user; // Attached by JwtAuthGuard!
    console.log('[RoleGuard.canActivate] User in RoleGuard:', user);
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
