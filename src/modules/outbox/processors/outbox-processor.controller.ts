import {
  Controller,
  Post,
  Req,
  HttpCode,
  HttpStatus,
  Body,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../../common/decorators/public.decorator.js';
import { OUTBOX_CONSTANTS } from '../constants/outbox.constants.js';
import { OutboxService } from '../outbox.service.js';

@Controller({
  version: OUTBOX_CONSTANTS.INTERNAL_VERSION,
  path: OUTBOX_CONSTANTS.INTERNAL_PATH,
})
export class OutboxProcessorController {
  constructor(private readonly outboxService: OutboxService) {}
  @Public()
  @Post(OUTBOX_CONSTANTS.ROUTE_PROCESS_SHIPMENT)
  @HttpCode(HttpStatus.OK)
  async processShipment(
    @Req() req: Request,
    @Body() body: { outboxId: string },
  ) {
    return this.outboxService.processShipment(req, body);
  }
}
