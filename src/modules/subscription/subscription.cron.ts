/**
 * @deprecated This file is intentionally empty.
 *
 * The three @Cron jobs that previously lived here have been migrated to
 * QStash HTTP webhook endpoints in `subscription-job.controller.ts`.
 *
 * QStash Schedules (configure once in the Upstash dashboard):
 *   - POST /api/v1/internal/subscription/expire-trials        → cron: 0 *\/6 * * *
 *   - POST /api/v1/internal/subscription/finalize-grace-periods → cron: 30 *\/6 * * *
 *   - POST /api/v1/internal/subscription/send-reminders       → cron: 0 9 * * *
 *
 * This file can be deleted once the migration is confirmed stable.
 */
