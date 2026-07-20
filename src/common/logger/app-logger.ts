import { ConsoleLogger } from '@nestjs/common';
import { neon } from '@neondatabase/serverless';

/**
 * NestJS startup contexts that generate ~1000 lines of route/DI logs.
 * Suppressed at LOG level. WARN and ERROR always pass through to console.
 * Set LOG_STARTUP_NOISE=true to re-enable (useful when debugging routes).
 */
const STARTUP_NOISE = new Set([
  'RouterExplorer',
  'RoutesResolver',
  'InstanceLoader',
  'NestFactory',
  'NestApplication',
]);

const IS_PROD = process.env.NODE_ENV === 'production';
const SHOW_STARTUP = process.env.LOG_STARTUP_NOISE === 'true';

// ── Neon HTTP driver (same one used by DrizzleModule) ────────────────────────
// Uses a raw SQL insert so AppLogger has zero module dependencies — it can
// safely be instantiated before the NestJS DI container is ready.
let _sql: ReturnType<typeof neon> | null = null;

function getSql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (url) _sql = neon(url);
  }
  return _sql;
}

/**
 * Fire-and-forget INSERT into system_logs.
 * Never throws — a logging failure must never crash the application.
 */
async function persistToDB(
  level: 'WARN' | 'ERROR',
  msg: string,
  context?: string,
  stack?: string,
): Promise<void> {
  try {
    const sql = getSql();
    if (!sql) return;
    await sql`
      INSERT INTO system_logs (level, context, msg, stack)
      VALUES (
        ${level},
        ${context ?? null},
        ${msg.slice(0, 2000)},
        ${stack ? stack.slice(0, 3000) : null}
      )
    `;
  } catch {
    // Intentionally silent — logger must never throw
  }
}

// ── Custom Logger ────────────────────────────────────────────────────────────

export class AppLogger extends ConsoleLogger {
  /**
   * Suppresses startup-noise contexts at LOG level.
   * All other LOG messages pass through unchanged.
   */
  override log(message: any, context?: string): void {
    if (!SHOW_STARTUP && context && STARTUP_NOISE.has(context)) return;
    super.log(message, context);
  }

  /**
   * WARN: printed to console + persisted to Neon DB in production.
   */
  override warn(message: any, context?: string): void {
    super.warn(message, context);
    if (IS_PROD) {
      void persistToDB('WARN', String(message), context);
    }
  }

  /**
   * ERROR: printed to console + persisted to Neon DB in production.
   */
  override error(message: any, stack?: string, context?: string): void {
    super.error(message, stack, context);
    if (IS_PROD) {
      void persistToDB('ERROR', String(message), context, stack);
    }
  }
}
