import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Inject,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import * as crypto from 'crypto';
import { and, desc, gte, eq, ilike, sql } from 'drizzle-orm';
import { DRIZZLE } from '../../drizzle/drizzle.module.js';
import type { DrizzleService } from '../../drizzle/drizzle.module.js';
import { system_logs } from '../../drizzle/schema/system_logs.schema.js';
import { Public } from '../decorators/public.decorator.js';

const ACCESS_SECRET = process.env.LOGS_ACCESS_SECRET ?? '';

@ApiTags('admin')
@Controller('v1/admin')
export class LogsController {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleService) {}

  private guard(secret?: string) {
    if (!ACCESS_SECRET || !secret) {
      throw new UnauthorizedException('Invalid or missing secret.');
    }
    const secretBuffer = Buffer.from(secret);
    const expectedBuffer = Buffer.from(ACCESS_SECRET);
    if (secretBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(secretBuffer, expectedBuffer)) {
      throw new UnauthorizedException('Invalid or missing secret.');
    }
  }

  /**
   * GET /api/v1/admin/logs?secret=xxx
   * Optional: &level=ERROR  &context=SlowRequest  &since=2026-07-01  &limit=100
   */
  @Public()
  @Get('logs')
  @ApiOperation({ summary: 'Read persisted WARN/ERROR logs from Neon DB' })
  @ApiQuery({ name: 'level', required: false, example: 'ERROR' })
  @ApiQuery({ name: 'context', required: false, example: 'SlowRequest' })
  @ApiQuery({ name: 'since', required: false, example: '2026-07-01' })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  async getLogs(
    @Headers('x-logs-secret') secret: string,
    @Query('level') level?: string,
    @Query('context') context?: string,
    @Query('since') since?: string,
    @Query('limit') limit = '50',
  ) {
    this.guard(secret);

    const count = Math.min(Number(limit) || 50, 500);
    const sinceDate = since
      ? new Date(since)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // default: last 7 days
    if (isNaN(sinceDate.getTime())) {
      throw new BadRequestException('Invalid "since" date format. Use ISO-8601, e.g. 2026-07-01.');
    }

    const rows = await this.db
      .select()
      .from(system_logs)
      .where(
        and(
          gte(system_logs.ts, sinceDate),
          level ? eq(system_logs.level, level) : undefined,
          context ? ilike(system_logs.context, `%${context}%`) : undefined,
        ),
      )
      .orderBy(desc(system_logs.ts))
      .limit(count);

    return {
      count: rows.length,
      filters: { level, context, since: sinceDate.toISOString(), limit: count },
      logs: rows,
    };
  }

  /**
   * GET /api/v1/admin/logs/stats?secret=xxx
   * Returns daily WARN/ERROR counts for the last 30 days.
   */
  @Public()
  @Get('logs/stats')
  @ApiOperation({ summary: 'Daily WARN/ERROR counts for the last 30 days' })
  async getLogStats(@Headers('x-logs-secret') secret: string) {
    this.guard(secret);

    const rows = await this.db
      .select({
        day: sql<string>`DATE(${system_logs.ts})`,
        level: system_logs.level,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(system_logs)
      .where(gte(system_logs.ts, sql`now() - INTERVAL '30 days'`))
      .groupBy(sql`DATE(${system_logs.ts})`, system_logs.level)
      .orderBy(desc(sql`DATE(${system_logs.ts})`), system_logs.level);

    return { stats: rows };
  }
}
