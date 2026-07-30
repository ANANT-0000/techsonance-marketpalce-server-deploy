import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JWT_GUARD } from './jwt-auth.guard.js';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module.js';
import { user, vendor } from '../../drizzle/schema/index.js';
import { eq } from 'drizzle-orm';
import { UserStatus } from '../../drizzle/types/types.js';

interface CacheEntry {
  status: UserStatus;
  vendor_status?: UserStatus;

  expiresAt: number;
}

import { Request } from 'express';

const cookieExtractor = (req: Request) => {
  let token = null;
  if (req && req.cookies) {
    token = req.cookies['accessToken'];
  }
  return token || ExtractJwt.fromAuthHeaderAsBearerToken()(req);
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, JWT_GUARD) {
  private readonly statusCache = new Map<string, CacheEntry>();
  private readonly pendingQueries = new Map<string, Promise<CacheEntry>>();
  private readonly CACHE_TTL_MS = 60 * 1000; // 60s — shorter TTL is safer for status changes
  private readonly MAX_CACHE_SIZE = 5000;
  private cleanupTimer: NodeJS.Timeout;

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleService) {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is missing!');
    }
    super({
      jwtFromRequest: cookieExtractor,
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

    const cachedUser = await this.getUserStatus(payload.sub);

    if (
      cachedUser.status !== UserStatus.ACTIVE &&
      cachedUser.status !== UserStatus.PENDING
    ) {
      throw new UnauthorizedException('User account is suspended or inactive.');
    }

    return {
      id: payload.sub,
      vendorId: payload.vendor_id,
      email: payload.email,
      role: payload.role,
      company_id: payload.company_id,

      vendor_status: cachedUser.vendor_status,
    };
  }

  private async getUserStatus(userId: string): Promise<CacheEntry> {
    const now = Date.now();
    const cached = this.statusCache.get(userId);

    if (cached && cached.expiresAt > now) {
      return cached;
    }

    // Cache Stampede Prevention: return the in-flight promise if one exists
    const pending = this.pendingQueries.get(userId);
    if (pending) {
      return pending;
    }

    const queryPromise = (async () => {
      try {
        const [dbUser] = await this.db
          .select({
            id: user.id,
            user_status: user.user_status,
            vendor_status: vendor.vendor_status,
          })
          .from(user)
          .leftJoin(vendor, eq(vendor.user_id, user.id))
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

        const cacheEntry: CacheEntry = {
          status,
          vendor_status: dbUser.vendor_status ?? undefined,
          expiresAt: Date.now() + this.CACHE_TTL_MS,
        };

        this.statusCache.set(userId, cacheEntry);
        return cacheEntry;
      } catch (error) {
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        throw new UnauthorizedException('Authentication database error.');
      } finally {
        this.pendingQueries.delete(userId);
      }
    })();

    this.pendingQueries.set(userId, queryPromise);
    return queryPromise;
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
