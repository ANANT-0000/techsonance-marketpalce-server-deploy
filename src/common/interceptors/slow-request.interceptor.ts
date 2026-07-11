import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';

/**
 * Thresholds (milliseconds)
 *  WARN  → process is taking longer than expected but may still succeed
 *  ERROR → process is dangerously close to / over Vercel Hobby 10 s limit
 *
 * Override via env vars for flexibility:
 *  SLOW_REQUEST_WARN_MS   (default 3000)
 *  SLOW_REQUEST_ERROR_MS  (default 8000)
 */
const WARN_MS = Number(process.env.SLOW_REQUEST_WARN_MS ?? 3000);
const ERROR_MS = Number(process.env.SLOW_REQUEST_ERROR_MS ?? 8000);

@Injectable()
export class SlowRequestInterceptor implements NestInterceptor {
  private readonly logger = new Logger('⏱ SlowRequest');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<Request>();
    const method = req.method;
    const url = req.originalUrl ?? req.url;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.check(method, url, start),
        error: () => this.check(method, url, start),
      }),
    );
  }

  private check(method: string, url: string, start: number): void {
    const elapsed = Date.now() - start;

    if (elapsed >= ERROR_MS) {
      this.logger.error(
        `🚨 CRITICAL SLOW REQUEST — ${method} ${url} took ${elapsed} ms ` +
          `(threshold: ${ERROR_MS} ms). ` +
          `On Vercel Hobby this is within ${10000 - elapsed} ms of the 10 s hard kill.`,
      );
    } else if (elapsed >= WARN_MS) {
      this.logger.warn(
        `⚠️  SLOW REQUEST — ${method} ${url} took ${elapsed} ms ` +
          `(threshold: ${WARN_MS} ms).`,
      );
    }
    // Fast requests are not logged — no noise in the happy path.
  }
}
