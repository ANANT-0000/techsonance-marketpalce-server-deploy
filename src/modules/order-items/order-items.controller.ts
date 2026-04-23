import { Controller, Get, Post } from '@nestjs/common';
import { OrderItemsService } from './order-items.service';

@Controller({ version: '1', path: 'order-items' })
export class OrderItemsController {
  constructor(private readonly orderItemsService: OrderItemsService) {}
  @Get('test')
  test() {
    return 'Order items controller is working';
  }
  @Post(':orderItemId')
  async updateOrderItemStatus() {
    // Implement logic to update order item status
    return { message: 'Order item status updated successfully' };
  }
}
