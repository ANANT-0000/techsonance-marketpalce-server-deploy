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
    console.log(orderId, trackingUrl);
    console.log(domain);
    return this.shippingService.addTrackingUrl(orderId, trackingUrl, domain);
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
