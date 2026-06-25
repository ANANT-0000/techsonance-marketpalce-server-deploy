import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Headers,
} from '@nestjs/common';
import { ShippingService } from './shipping.service';

@Controller({
  version: '1',
  path: 'shipping',
})
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @Post()
  async addTrackingUrl(
    @Body('orderId') orderId: string,
    @Body('trackingUrl') trackingUrl: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.shippingService.addTrackingUrl(orderId, trackingUrl, domain);
  }
  @Get('settings')
  async getShippingSettings(@Headers('company-domain') domain: string) {
    return this.shippingService.getShippingSettings(domain);
  }

  @Patch('settings')
  async updateShippingSettings(
    @Headers('company-domain') domain: string,
    @Body() payload: any,
  ) {
    return this.shippingService.updateShippingSettings(domain, payload);
  }

  @Patch(':orderId')
  async updateTrackingUrl(
    @Param('orderId') orderId: string,
    @Body('trackingUrl') trackingUrl: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.shippingService.updateTrackingUrl(orderId, trackingUrl, domain);
  }
}
