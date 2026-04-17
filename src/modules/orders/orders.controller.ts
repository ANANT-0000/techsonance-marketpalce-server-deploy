import { Body, Controller, Get, Headers, Param, Patch } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrderStatus } from 'src/drizzle/types/types';

@Controller({
  version: '1',
  path: 'orders',
})
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}
  // @Get(':orderId')
  // async getOrderDetails(
  //   @Param('orderId') orderId: string,
  //   @Headers('company-domain') domain: string,
  // ) {
  //   return this.ordersService.getOrderById(orderId, domain);
  // }
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
  @Get()
  async getOrdersList(@Headers('company-domain') domain: string) {
    return this.ordersService.getOrdersList(domain);
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
