import * as pg from 'drizzle-orm/pg-core';
import { company } from './main.schema.js';
import { OutboxJobStatus } from '../../modules/outbox/constants/outbox.constants.js';

/**
 * Persistent outbox table — every Shiprocket sync job is written here
 * atomically inside the same DB transaction that commits the order.
 *
 * This guarantees that if the process crashes or Redis is unreachable after
 * the order commits, the job is never lost. The Sweeper Cron reads
 * PENDING rows older than 1 minute and re-enqueues them to BullMQ.
 */
export const outbox_jobs = pg.pgTable(
  'outbox_jobs',
  {
    id: pg.uuid('id').primaryKey().defaultRandom(),

    /** Discriminator — e.g. 'CREATE_SHIPROCKET_DRAFT_ORDER' */
    job_type: pg.varchar('job_type', { length: 100 }).notNull(),

    /** Arbitrary JSON payload consumed by the processor */
    payload: pg.jsonb('payload').notNull(),

    /** PENDING → PROCESSING → COMPLETED | FAILED */
    status: pg
      .varchar('status', { length: 50 })
      .default(OutboxJobStatus.PENDING)
      .notNull(),

    /** Last error message stored for observability / alerting */
    error_message: pg.text('error_message'),

    /**
     * Incremented by the processor on each failure.
     * When retry_count reaches 3 the status is set to FAILED
     * and BullMQ stops retrying.
     */
    retry_count: pg.integer('retry_count').default(0).notNull(),

    created_at: pg.timestamp('created_at').notNull().defaultNow(),
    updated_at: pg
      .timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),

    company_id: pg
      .uuid('company_id')
      .references(() => company.id, { onDelete: 'cascade' }),
  },
  (t) => [
    // Sweeper Cron uses both columns in its WHERE clause
    pg.index('idx_outbox_jobs_status').on(t.status),
    pg.index('idx_outbox_jobs_created_at').on(t.created_at),
  ],
);
