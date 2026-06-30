import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { ShippingManagerService } from './shipping-manager.service.js';

@Controller('webhooks')
export class ShippingWebhookController {
  constructor(
    private readonly shippingManagerService: ShippingManagerService,
  ) {}

  /**
   * @Public() bypasses the platform JwtAuthGuard — Shiprocket has no platform JWT.
   * All authentication logic lives inside ShippingManagerService.handleWebhookUpdate.
   */
  @Public()
  @Post('shipping-updates')
  @HttpCode(HttpStatus.OK)
  async handleShippingUpdates(
    @Body() payload: any,
    @Headers('authorization') authHeader: string,
  ) {
    return this.shippingManagerService.handleWebhookUpdate(payload, authHeader);
  }
}
