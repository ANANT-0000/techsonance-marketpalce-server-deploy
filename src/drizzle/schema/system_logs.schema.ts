import * as pg from 'drizzle-orm/pg-core';

/**
 * system_logs — persistent application log store.
 *
 * Only WARN and ERROR entries are written here (INFO/DEBUG are console-only).
 * Writes are fire-and-forget via the Neon HTTP driver, so they add zero
 * latency to the request that generated the log.
 *
 * Retention: rows live until you DELETE them — no eviction like Redis.
 * Recommended cleanup: run a nightly cron to delete rows older than 30 days.
 */
export const system_logs = pg.pgTable(
  'system_logs',
  {
    id: pg.serial('id').primaryKey(),

    /** ISO-8601 timestamp of when the log was emitted. */
    ts: pg.timestamp('ts', { withTimezone: true }).notNull().defaultNow(),

    /** 'WARN' | 'ERROR' */
    level: pg.varchar('level', { length: 10 }).notNull(),

    /**
     * NestJS Logger context — identifies which class/interceptor emitted it.
     * e.g. '⏱ SlowRequest', 'OrdersService', 'DrizzleQuery'
     */
    context: pg.varchar('context', { length: 100 }),

    /** Log message text (truncated to 2000 chars). */
    msg: pg.text('msg').notNull(),

    /** Stack trace for ERROR entries (truncated to 3000 chars). */
    stack: pg.text('stack'),
  },
  (table) => [
    // Fast lookup by time range (most common query pattern)
    pg.index('idx_system_logs_ts').on(table.ts),
    // Fast lookup by severity
    pg.index('idx_system_logs_level').on(table.level),
  ],
);
