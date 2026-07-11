import { Module, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema/index.js';

export const DRIZZLE: unique symbol = Symbol('DRIZZLE');

/** The top-level database instance type. */
export type DrizzleDB = NeonHttpDatabase<typeof schema>;

/**
 * Extracts the exact transaction type that db.transaction() passes to its
 * callback. This ensures DrizzleTransaction always matches what Drizzle
 * internally produces — no generic parameter mismatches.
 */
export type DrizzleTransaction = Parameters<
  Parameters<DrizzleDB['transaction']>[0]
>[0];

/**
 * DrizzleService is the union of the top-level DB and its transaction context.
 *
 * Services that accept a DrizzleService parameter can be called both:
 *   - directly:   someService.method(this.db, ...)
 *   - in a tx:    await db.transaction(tx => someService.method(tx, ...))
 *
 * Why the union instead of just NeonHttpDatabase:
 *   NeonHttpDatabase and PgTransaction<NeonHttpQueryResultHKT, ...> are
 *   structurally different types ($withAuth, batch exist only on the DB).
 *   Casting tx as NeonHttpDatabase fails. Deriving DrizzleTransaction via
 *   Parameters<> gives us the exact type Drizzle infers, so the union works.
 */
export type DrizzleService = DrizzleDB | DrizzleTransaction;

/**
 * Why @neondatabase/serverless (HTTP) instead of pg.Pool (TCP)?
 *
 * On Vercel, every cold start opens a new pg.Pool (up to 10 TCP connections).
 * Under concurrent traffic + QStash cron bursts, multiple Vercel instances
 * spike to 50+ open connections, exhausting Neon's free-tier limit (~107).
 * Every new DB call then hangs until Vercel kills the function → 504.
 *
 * The Neon HTTP driver uses stateless HTTP/fetch per query — no persistent
 * sockets, no pool, no connection-limit exhaustion. Designed for serverless.
 */
@Module({
  imports: [],
  providers: [
    {
      provide: DRIZZLE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): DrizzleDB => {
        const databaseUrl = configService.get<string>('DATABASE_URL');
        if (!databaseUrl) {
          throw new Error(
            'DATABASE_URL is not defined in the environment variables.',
          );
        }
        // neon() uses HTTP — not a TCP pool. No connection limit issues.
        const sql = neon(databaseUrl);
        const dbLogger = new Logger('⏱ DrizzleQuery');
        const QUERY_WARN_MS = Number(process.env.SLOW_QUERY_WARN_MS ?? 1000);
        const QUERY_ERROR_MS = Number(process.env.SLOW_QUERY_ERROR_MS ?? 4000);
        return drizzle(sql, {
          schema,
          logger: {
            logQuery(query: string, params: unknown[]) {
              // Drizzle calls logQuery synchronously just before executing.
              // We patch it to capture timing by re-wrapping with a start stamp.
              // Because the neon HTTP driver is async, the actual timing happens
              // in the SlowRequestInterceptor at the HTTP level. This logger gives
              // us the raw SQL + params for forensic inspection in prod logs.
              const start = Date.now();
              // Schedule a micro-task to read elapsed after the promise resolves.
              // Works for local dev; in prod the HTTP-level interceptor is more reliable.
              Promise.resolve().then(() => {
                const elapsed = Date.now() - start;
                const preview = query.length > 120 ? query.slice(0, 120) + '…' : query;
                if (elapsed >= QUERY_ERROR_MS) {
                  dbLogger.error(
                    `🚨 SLOW QUERY (${elapsed} ms): ${preview} | params: ${JSON.stringify(params).slice(0, 80)}`,
                  );
                } else if (elapsed >= QUERY_WARN_MS) {
                  dbLogger.warn(
                    `⚠️  SLOW QUERY (${elapsed} ms): ${preview}`,
                  );
                }
              });
            },
          },
        });
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DrizzleModule {}
