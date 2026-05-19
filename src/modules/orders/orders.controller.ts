import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrderStatus } from '../../drizzle/types/types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RoleGuard } from '../../guards/role.guard';
import { Role } from '../../enums/role.enum';
import { Roles } from '../../common/decorators/roles.decorator';
import { ProductPoliciesService } from '../product-policies/product-policies.service';

@Controller({
  version: '1',
  path: 'orders',
})
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly productPoliciesService: ProductPoliciesService,
  ) {}

  @Get()
  // @UseGuards(JwtAuthGuard, RoleGuard)
  // @Roles(Role.ADMIN, Role.VENDOR)
  async getOrdersList(
    @Headers('company-domain') domain: string,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: OrderStatus,
  ) {
    console.log('orderlist');
    return this.ordersService.getOrdersList(
      domain,
      Number(offset),
      Number(limit),
      status,
    );
  }

  @Get('pending')
  // @UseGuards(JwtAuthGuard, RoleGuard)
  // @Roles(Role.ADMIN, Role.VENDOR)
  async getPendingOrders(@Headers('company-domain') domain: string) {
    return this.ordersService.getPendingOrders(domain);
  }

  @Get(':orderId')
  // @UseGuards(JwtAuthGuard, RoleGuard)
  // @Roles(Role.CUSTOMER)
  async getUserOrderDetails(
    @Param('orderId') orderId: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.ordersService.getUserOrderDetails(orderId, domain);
  }
  @Get('user/:userId')
  // @UseGuards(JwtAuthGuard, RoleGuard)
  // @Roles(Role.CUSTOMER)
  async getUserOrders(
    @Param('userId') userId: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.ordersService.getUserOrders(userId, domain);
  }
  @Get(':orderid/details')
  // @UseGuards(JwtAuthGuard, RoleGuard)
  // @Roles(Role.ADMIN, Role.VENDOR)
  async getOrderDetails(
    @Param('orderid') orderId: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.ordersService.getOrderDetails(orderId, domain);
  }
  @Patch(':orderid/status')
  // @UseGuards(JwtAuthGuard, RoleGuard)
  // @Roles(Role.ADMIN, Role.VENDOR)
  async setOrderStatus(
    @Param('orderid') orderId: string,
    @Body('status') newStatus: OrderStatus,
    @Headers('company-domain') domain: string,
  ) {
    return this.ordersService.setOrderStatus(orderId, newStatus, domain);
  }
  @Get('warranty/:orderId')
  async getWarrantyUrl(@Param('orderId') orderId: string) {
    console.log(
      `[ProductPoliciesController.getWarrantyUrl] Fetching warranty URL for orderId: ${orderId}`,
    );
    return this.productPoliciesService.getWarrantyUrl(orderId);
  }
  @Get('analytics/revenue')
  async getSalesAnalytics(
    @Headers('company-domain') domain: string,
    @Query('days') days?: string,
  ) {
    return this.ordersService.getSalesAnalytics(
      domain,
      days ? Number(days) : 30,
    );
  }
  @Get('analytics/top-products')
  @HttpCode(HttpStatus.OK)
  async getTopProducts(@Headers('company-domain') domain: string) {
    return this.ordersService.getTopSellingProducts(domain, 5);
  }
  @Get('analytics/conversion')
  @HttpCode(HttpStatus.OK)
  getConversionRate(@Headers('company-domain') domain: string) {
    return this.ordersService.getConversionMetrics(domain);
  }

  @Get('analytics/export')
  @Header('Content-Type', 'text/csv')
  @Header(
    'Content-Disposition',
    'attachment; filename="product_performance.csv"',
  )
  exportAnalytics(@Headers('company-domain') domain: string) {
    return this.ordersService.exportVendorAnalytics(domain);
  }
}
