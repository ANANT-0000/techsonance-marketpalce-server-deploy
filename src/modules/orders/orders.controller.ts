import { SkipSubscription } from '../../common/decorators/skip-subscription.decorator.js';
import {
  Body,
  Controller,
  Get,
  Headers,
  Res,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import { OrderStatus } from '../../drizzle/types/types.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RoleGuard } from '../../guards/role.guard.js';
import { Role } from '../../enums/role.enum.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { VendorActiveGuard } from '../../guards/vendor-status.guard.js';
import { ProductPoliciesService } from '../product-policies/product-policies.service.js';
import type { Response } from 'express';
@Controller({
  version: '1',
  path: 'orders',
})
@UseGuards(RoleGuard, VendorActiveGuard)
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly productPoliciesService: ProductPoliciesService,
  ) {}

  @SkipSubscription()
  @Get()
  @Roles(Role.ADMIN, Role.VENDOR)
  async getOrdersList(
    @Headers('company-domain') domain: string,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: OrderStatus,
  ) {
    return this.ordersService.getOrdersList(
      domain,
      Number(offset),
      Number(limit),
      status,
    );
  }

  @SkipSubscription()
  @Get('pending')
  @Roles(Role.ADMIN, Role.VENDOR)
  async getPendingOrders(
    @Headers('company-domain') domain: string,
    @Query('search') search?: string,
    @Query('offset') offset?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('date') date?: string,
    @Query('sortby') sortby?: 'asc' | 'desc',
  ) {
    return this.ordersService.getPendingOrders(domain, {
      search: search ?? '',
      limit: Number(limit) || 10,
      offset: Number(offset) || 0,
      status,
      date: date ?? '',
      sortby: sortby ?? 'desc',
    });
  }

  @SkipSubscription()
  @Get(':orderId')
  @Roles(Role.CUSTOMER, Role.ADMIN, Role.VENDOR)
  async getUserOrderDetails(
    @Param('orderId') orderId: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.ordersService.getUserOrderDetails(orderId, domain);
  }
  @SkipSubscription()
  @Get('order-count/:userId')
  @Roles(Role.CUSTOMER, Role.ADMIN, Role.VENDOR)
  async getOrdersCount(
    @Param('userId') userId: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.ordersService.getOrdersCount(userId, domain);
  }
  @SkipSubscription()
  @Get(':orderid/details')
  @Roles(Role.ADMIN, Role.VENDOR)
  async getOrderDetails(
    @Param('orderid') orderId: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.ordersService.getOrderDetails(orderId, domain);
  }
  @Patch(':orderid/status')
  @Roles(Role.ADMIN, Role.VENDOR)
  async setOrderStatus(
    @Param('orderid') orderId: string,
    @Body('status') newStatus: OrderStatus,
    @Headers('company-domain') domain: string,
  ) {
    return this.ordersService.setOrderStatus(orderId, newStatus, domain);
  }
  @Get('warranty/:orderId')
  async getWarrantyUrl(@Param('orderId') orderId: string) {
    return this.productPoliciesService.getWarrantyUrl(orderId);
  }
  @SkipSubscription()
  @Get('analytics/revenue')
  @Roles(Role.ADMIN, Role.VENDOR)
  async getSalesAnalytics(
    @Headers('company-domain') domain: string,
    @Query('days') days?: string,
  ) {
    return this.ordersService.getSalesAnalytics(
      domain,
      days ? Number(days) : 30,
    );
  }
  @SkipSubscription()
  @Get('analytics/top-products')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.VENDOR)
  async getTopProducts(@Headers('company-domain') domain: string) {
    return this.ordersService.getTopSellingProducts(domain, 5);
  }
  @SkipSubscription()
  @Get('analytics/conversion')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.VENDOR)
  getConversionRate(@Headers('company-domain') domain: string) {
    return this.ordersService.getConversionMetrics(domain);
  }

  @SkipSubscription()
  @Get('analytics/export')
  @Roles(Role.ADMIN, Role.VENDOR)
  async exportAnalytics(
    @Headers('company-domain') domain: string,
    @Res() res: Response,
  ) {
    const csv = await this.ordersService.exportVendorAnalytics(domain);

    // Write headers and body manually — interceptors never see this response.
    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="store_analytics_${dateStr}.csv"`,
    );
    // Send raw CSV string — no JSON wrapping.
    res.send(csv);
  }

  @Post(':orderId/retry-shipping')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.VENDOR)
  async retryFailedShipping(
    @Param('orderId') orderId: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.ordersService.retryFailedShipping(orderId, domain);
  }
}

