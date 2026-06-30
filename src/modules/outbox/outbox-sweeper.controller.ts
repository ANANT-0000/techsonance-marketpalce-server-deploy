import { Controller, Get, Req, HttpCode, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';
import { OutboxService } from './outbox.service.js';
import { Public } from '../../common/decorators/public.decorator.js';
import {
  OUTBOX_CONSTANTS,
  OutboxJobStatus,
} from './constants/outbox.constants.js';

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
