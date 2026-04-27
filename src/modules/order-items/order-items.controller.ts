import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { OrderItemsService } from './order-items.service';
import { CancelledByEnum } from 'src/drizzle/types/types';

@Controller({ version: '1', path: 'order-items' })
export class OrderItemsController {
  constructor(private readonly orderItemsService: OrderItemsService) {}
  @Get('test')
  test() {
    return 'Order items controller is working';
  }
  @Get(':orderItemId')
  async getOrderItemDetails(
    @Param('orderItemId') orderItemId: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.orderItemsService.getOrderItemDetails(orderItemId, domain);
  }
  // @Post(':orderItemId')
  // async updateOrderItemStatus() {
  //   // Implement logic to update order item status
  //   return { message: 'Order item status updated successfully' };
  // }
  @Patch(':orderItemId/cancel')
  async cancelOrderItem(
    @Param('orderItemId') orderItemId: string,
    @Body()
    body: {
      userId: string;
      cancelReason: string;
    },
    @Headers('company-domain') domain: string,
  ) {
    return this.orderItemsService.cancelOrder(
      orderItemId,
      body.userId,
      body.cancelReason,
      domain,
    );
  }

}
