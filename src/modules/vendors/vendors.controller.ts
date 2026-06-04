import { OrdersService } from '../orders/orders.service';
import { VendorsService } from './vendors.service';
import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';

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
  @Get('analytics')
  @HttpCode(HttpStatus.OK)
  getVendorDashboardData(
    @Headers('company-domain') domain: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.vendorsService.getAnalyticsData(domain, startDate, endDate);
  }

  @Get('analytics/pdf-data')
  @HttpCode(HttpStatus.OK)
  getAnalyticsPdfData(
    @Headers('company-domain') domain: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.vendorsService.getAnalyticsPdfData(domain, startDate, endDate);
  }
}
