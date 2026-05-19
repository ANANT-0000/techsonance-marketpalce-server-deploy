import { OrdersService } from '../orders/orders.service';
import { VendorsService } from './vendors.service';
import { Controller, Get, Headers, HttpCode, HttpStatus } from '@nestjs/common';

@Controller({ version: '1', path: 'vendors' })
export class VendorsController {
  constructor(
    private readonly vendorsService: VendorsService,
    private readonly ordersService: OrdersService,
  ) {}
  @Get('analytics/top-products')
  @HttpCode(HttpStatus.OK)
  getTopProducts(@Headers('company-domain') domain: string) {
    return this.ordersService.getTopSellingProducts(domain, 5);
  }
}
