import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from 'src/enums/role.enum';

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const skipGuard = this.reflector.getAllAndOverride<boolean>(
      'skipAuthGuard',
      [context.getHandler(), context.getClass()],
    );
    if (skipGuard) {
      return true;
    }
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest();
    if (!user || !user.role) {
      return false;
    }
    return requiredRoles.some((role: Role) =>
      Array.isArray(user.role) ? user.role.includes(role) : user.role === role,
    );
  }
}
