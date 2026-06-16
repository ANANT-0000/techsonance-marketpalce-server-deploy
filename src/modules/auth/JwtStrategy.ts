import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JWT_GUARD } from './jwt-auth.guard';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import { user } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { UserStatus } from '../../drizzle/types/types';

interface CacheEntry {
  status: UserStatus;
  expiresAt: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, JWT_GUARD) {
  private readonly statusCache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL_MS = 60 * 1000; // 60s — shorter TTL is safer for status changes
  private readonly MAX_CACHE_SIZE = 5000;
  private cleanupTimer: NodeJS.Timeout;

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleService) {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is missing!');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });

    // Periodic cleanup every 5 minutes regardless of traffic
    this.cleanupTimer = setInterval(() => this.cleanupCache(), 5 * 60 * 1000);
    this.cleanupTimer.unref(); // Don't block process exit
  }

  async validate(payload: any) {
    if (!payload?.sub) {
      throw new UnauthorizedException();
    }

    const userStatus = await this.getUserStatus(payload.sub);

    if (userStatus !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User account is suspended or inactive.');
    }

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      company_id: payload.company_id,
      password_change_required: payload.password_change_required,
    };
  }

  private async getUserStatus(userId: string): Promise<UserStatus> {
    const now = Date.now();
    const cached = this.statusCache.get(userId);

    if (cached && cached.expiresAt > now) {
      return cached.status;
    }

    const [dbUser] = await this.db
      .select({ id: user.id, user_status: user.user_status })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
      .catch(() => {
        throw new UnauthorizedException('Authentication database error.');
      });

    if (!dbUser) {
      this.statusCache.delete(userId); // Evict stale entry if user deleted
      throw new UnauthorizedException('User account no longer exists.');
    }

    const status = dbUser.user_status ?? UserStatus.INACTIVE;

    // Evict LRU-style if at capacity before inserting
    if (
      !this.statusCache.has(userId) &&
      this.statusCache.size >= this.MAX_CACHE_SIZE
    ) {
      const firstKey = this.statusCache.keys().next().value;
      if (firstKey) this.statusCache.delete(firstKey);
    }

    this.statusCache.set(userId, {
      status,
      expiresAt: now + this.CACHE_TTL_MS,
    });

    return status;
  }

  /** Call this from your UserService/AdminService when suspending/activating a user */
  invalidate(userId: string): void {
    this.statusCache.delete(userId);
  }

  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, value] of this.statusCache.entries()) {
      if (value.expiresAt <= now) {
        this.statusCache.delete(key);
      }
    }
  }
}
