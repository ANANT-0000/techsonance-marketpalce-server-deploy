import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { OrderItemsService } from './order-items.service';
import { OrderStatus } from '../../drizzle/types/types';

@Controller({ version: '1', path: 'order-items' })
export class OrderItemsController {
  constructor(private readonly orderItemsService: OrderItemsService) {}
  @Get('test')
  test() {
    return 'Order items controller is working';
  }
  @Get('user/:userId')
  async getUserOrderItems(
    @Param('userId') userId: string,
    @Headers('company-domain') domain: string,
    @Query('status') status?: OrderStatus,
    @Query('date') date?: string,
    @Query('limit') limit?: string,
    @Query('sortby') sortby?: 'asc' | 'desc',
    @Query('offset') offset?: string,
  ) {
    return this.orderItemsService.getUserOrderItems(userId, domain, {
      offset: Number(offset) || 0,
      limit: Number(limit) || 10,
      status: status as OrderStatus,
      date: date ?? '',
      sortby: sortby ?? 'desc',
    });
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

  // @Get(':orderItemId/download-warranty')
  // async downloadWarrantyDocument(@Param('orderItemId') orderItemId: string) {
  //   const policySnapshot =
  //     await this.productPoliciesService.getOrderItemPolicy(orderItemId);

  //   if (!policySnapshot.document_generated || !policySnapshot.document_url) {
  //     throw new NotFoundException(
  //       'Warranty document has not been generated yet or is not applicable.',
  //     );
  //   }

  // Redirect the user directly to the Cloudinary/AWS PDF URL

  //   return policySnapshot.document_url;
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
