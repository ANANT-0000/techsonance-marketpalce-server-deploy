import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { DRIZZLE, type DrizzleService } from 'src/drizzle/drizzle.module';
import { OrderStatus } from 'src/drizzle/types/types';
import { CompanyService } from '../company/company.service';
import { InventoryService } from '../inventory/inventory.service';
import { MailService } from 'src/common/services/mail/mail.service';
import { order_items, orders } from 'src/drizzle/schema/shop.schema';
import { and, eq } from 'drizzle-orm';

@Injectable()
export class OrderItemsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
    private readonly inventoryService: InventoryService,
    private readonly mailService: MailService,
  ) {}
  async setOrderItemStatus(
    itemId: string,
    newStatus: OrderStatus,
    domain: string,
  ) {
    const companyId = await this.companyService.find(domain);
    if (!companyId) {
      throw new HttpException(
        `Company not found ${domain}`,
        HttpStatus.NOT_FOUND,
      );
    }

    try {
      const [existingItem] = await this.db
        .select({ id: order_items.id, order_id: order_items.order_id })
        .from(order_items)
        .where(eq(order_items.id, itemId))
        .limit(1);
      if (!existingItem || !existingItem.order_id) {
        throw new HttpException('Order item not found', HttpStatus.NOT_FOUND);
      }
      const [isOrderExist] = await this.db
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(
            eq(orders.id, existingItem.order_id),
            eq(orders.company_id, companyId),
          ),
        )
        .limit(1);
      if (!isOrderExist) {
        throw new HttpException(
          'Order not found for the item',
          HttpStatus.NOT_FOUND,
        );
      }
      if (
        Object.values(OrderStatus).includes(
          newStatus.toLowerCase() as OrderStatus,
        )
      ) {
        console.log('✅ Valid enum value', newStatus);
      } else {
        console.log('❌ Not a valid enum value', newStatus);
        throw new HttpException(
          'Invalid order status value',
          HttpStatus.BAD_REQUEST,
        );
      }
      const orderItemUpdated = await this.db
        .update(order_items)
        .set({ order_status: newStatus.toLowerCase() as OrderStatus })
        .where(
          and(
            eq(order_items.id, existingItem.id),
            eq(order_items.order_id, isOrderExist.id),
          ),
        )
        .catch((error) => {
          console.error('Error updating order status:', error);
          throw new InternalServerErrorException(
            'Failed to update order status',
            {
              cause: error,
            },
          );
        });
      console.log('order items updated to processing', orderItemUpdated);
      return { message: 'Order item status updated successfully' };
    } catch (error) {
      console.error('Error updating order status:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update order status', {
        cause: error,
      });
    }
  }
}
