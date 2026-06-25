import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { ShippingManagerService } from './shipping-manager.service';

@Controller('webhooks')
export class ShippingWebhookController {
  constructor(
    private readonly shippingManagerService: ShippingManagerService,
  ) {}

  @Public()
  @Post('shipping-updates')
  @HttpCode(HttpStatus.OK)
  async handleShippingUpdates(@Body() payload: any) {
    console.log('web hook payload', payload);
    return this.shippingManagerService.handleWebhookUpdate(payload);
  }
}
