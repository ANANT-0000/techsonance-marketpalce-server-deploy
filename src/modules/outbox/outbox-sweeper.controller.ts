import {
  Controller,
  Get,
  Req,
  Inject,
  Logger,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { and, eq, lt } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import { outbox_jobs } from '../../drizzle/schema';
import { OutboxService } from './outbox.service';
import { Public } from '../../common/decorators/public.decorator';
import {
  OUTBOX_CONSTANTS,
  OutboxJobStatus,
} from './constants/outbox.constants';

@Controller({
  version: OUTBOX_CONSTANTS.INTERNAL_VERSION,
  path: OUTBOX_CONSTANTS.INTERNAL_PATH,
})
export class OutboxSweeperController {
  constructor(private readonly outboxService: OutboxService) {}

  @Public()
  @Get(OUTBOX_CONSTANTS.ROUTE_SWEEP_OUTBOX)
  @HttpCode(HttpStatus.OK)
  async sweepOutbox(@Req() req: Request) {
    this.outboxService.sweepOutbox(req);
  }
}
