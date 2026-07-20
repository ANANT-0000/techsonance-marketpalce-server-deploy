import { OrdersService } from '../orders/orders.service.js';
import { VendorsService } from './vendors.service.js';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { SkipSubscription } from '../../common/decorators/skip-subscription.decorator.js';

@Controller({ version: '1', path: 'vendors' })
export class VendorsController {
  constructor(
    private readonly vendorsService: VendorsService,
    private readonly ordersService: OrdersService,
  ) {}
  @SkipSubscription()
  @Get('analytics/top-products')
  @HttpCode(HttpStatus.OK)
  getTopProducts(@Headers('company-domain') domain: string) {
    return this.ordersService.getTopSellingProducts(domain, 5);
  }
  @SkipSubscription()
  @Get('analytics')
  @HttpCode(HttpStatus.OK)
  getVendorDashboardData(
    @Headers('company-domain') domain: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.vendorsService.getAnalyticsData(domain, startDate, endDate);
  }

  @SkipSubscription()
  @Get('analytics/pdf-data')
  @HttpCode(HttpStatus.OK)
  getAnalyticsPdfData(
    @Headers('company-domain') domain: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.vendorsService.getAnalyticsPdfData(domain, startDate, endDate);
  }

  @Public()
  @Get('check-email')
  @HttpCode(HttpStatus.OK)
  checkEmail(@Query('email') email: string) {
    return this.vendorsService.checkEmail(email);
  }

  @Public()
  @Get('check-phone')
  @HttpCode(HttpStatus.OK)
  checkPhone(@Query('phone') phone: string) {
    return this.vendorsService.checkPhone(phone);
  }

  @Patch(':id/preferences/tour-complete')
  @HttpCode(HttpStatus.OK)
  async completeVendorTour(
    @Param('id') vendorId: string,
    @Body('tourId') tourId: string,
  ) {
    return this.vendorsService.markTourAsComplete(vendorId, tourId);
  }
}
