// ../../modules/auth/jwt-auth.guard.ts
import {
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator.js';
import { ALLOW_CLEANUP_KEY } from '../../common/decorators/allow-cleanup.decorator.js';

export const JWT_GUARD = 'jwt';

@Injectable()
export class JwtAuthGuard extends AuthGuard(JWT_GUARD) {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Check if route allows cleanup bypass
    const allowCleanup = this.reflector.getAllAndOverride<boolean>(
      ALLOW_CLEANUP_KEY,
      [context.getHandler(), context.getClass()],
    );
    const request = context.switchToHttp().getRequest();
    const cleanupToken = request.headers['cleanup-token'];

    if (allowCleanup && request.headers['cleanup-token'] === 'true') {
      return true;
    }

    // Run normal JWT validation
    return super.canActivate(context) as Promise<boolean>;
  }

  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      this.logger.warn(
        `JwtAuthGuard block: Token missing, invalid, or expired. Error: ${err?.message || 'N/A'}, Info: ${info?.message || 'N/A'}`,
      );
      throw (
        err ||
        new UnauthorizedException('Invalid or missing authentication token')
      );
    }
    return user;
  }
}
