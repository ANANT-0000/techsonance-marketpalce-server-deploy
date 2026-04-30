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
import { OrdersService } from './orders.service';
import { CancelledByEnum, OrderStatus } from 'src/drizzle/types/types';
import { CLIENT_RENEG_LIMIT } from 'tls';

@Controller({
  version: '1',
  path: 'orders',
})
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) { }

  @Get()
  async getOrdersList(
    @Headers('company-domain') domain: string,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: OrderStatus,
    @Query('userId') userId?: string,
  ) {
    return this.ordersService.getOrdersList(domain, Number(offset), Number(limit), status);
  }


  @Get('pending')
  async getPendingOrders(@Headers('company-domain') domain: string) {
    console.log('hitted by order pending',domain);
    return this.ordersService.getPendingOrders(domain);
  }

  @Get(':orderId')
  async getUserOrderDetails(
    @Param('orderId') orderId: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.ordersService.getUserOrderDetails(orderId, domain);
  }
  @Get('user/:userId')
  async getUserOrders(
    @Param('userId') userId: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.ordersService.getUserOrders(userId, domain);
  }
  @Get(':orderid/details')
  async getOrderDetails(
    @Param('orderid') orderId: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.ordersService.getOrderDetails(orderId, domain);
  }
  @Patch(':orderid/status')
  async setOrderStatus(
    @Param('orderid') orderId: string,
    @Body('status') newStatus: OrderStatus,
    @Headers('company-domain') domain: string,
  ) {
    return this.ordersService.setOrderStatus(orderId, newStatus, domain);
  }
}
