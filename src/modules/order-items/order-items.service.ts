import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { DRIZZLE, type DrizzleService } from 'src/drizzle/drizzle.module';
import {
  CancelledByEnum,
  OrderStatus,
  PaymentStatus,
  productImageType,
  refundStatusEnum,
} from 'src/drizzle/types/types';
import { CompanyService } from '../company/company.service';
import { InventoryService } from '../inventory/inventory.service';
import { MailService } from 'src/common/services/mail/mail.service';
import {
  order_item_cancelled,
  order_items,
  orders,
  payments,
  product_images,
  refunds,
} from 'src/drizzle/schema/shop.schema';
import { and, eq } from 'drizzle-orm';
import { user } from 'src/drizzle/schema/users.schema';
import { user_roles } from 'src/drizzle/schema';

@Injectable()
export class OrderItemsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
    private readonly inventoryService: InventoryService,
    private readonly mailService: MailService,
  ) {}

  async getOrderItemDetails(orderItemId: string, domain: string) {
    try {
      const companyId = await this.companyService.find(domain);
      const itemExists = await this.db
        .select({ id: order_items.id })
        .from(order_items)
        .where(eq(order_items.id, orderItemId));
      if (!itemExists.length) {
        throw new HttpException('Order item not found', HttpStatus.NOT_FOUND);
      }
      const orderItem = await this.db.query.order_items
        .findFirst({
          where: eq(order_items.id, orderItemId),
          with: {
            variant: {
              columns: {
                id: true,
                product_id: true,
                variant_name: true,
                price: true,
                sku: true,
              },
              with: {
                images: {
                  where: eq(product_images.imgType, productImageType.MAIN),
                },
              },
            },
          },
        })
        .catch((error) => {
          console.error('Error fetching order item details:', error);
          throw new InternalServerErrorException(
            'Failed to fetch order item details',
            {
              cause: error,
            },
          );
        });
      console.log('orderItem', orderItem);
      if (!orderItem) {
        throw new HttpException('Order item not found', HttpStatus.NOT_FOUND);
      }
      return orderItem;
    } catch (error) {
      console.error('Error fetching order item details:', error);
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to fetch order item details',
        {
          cause: error,
        },
      );
    }
  }
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

  // Implement other order item related methods like cancellation, returns, etc.
  async cancelOrder(
    orderItemId: string,
    userId: string,
    cancelReason: string,
    domain: string,
  ) {
    try {
      console.log(
        `Cancelling order item ${orderItemId} for user ${userId} with reason: ${cancelReason} in company ${domain}`,
      );
      const companyId = await this.companyService.find(domain);
      console.log('finding user...');
      const [userRecord] = await this.db
        .select({ id: user.id, role_id: user.role_id })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1)
        .catch((error) => {
          console.error('Error fetching user record:', error);
          throw new InternalServerErrorException(
            'Failed to fetch user record',
            {
              cause: error,
            },
          );
        });
      if (!userRecord || !userRecord.role_id) {
        console.log('User not found', userRecord);
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      console.log('User found', userRecord);
      console.log('finding Role...');
      const [RoleRecord] = await this.db
        .select({ role_id: user_roles.id, role_name: user_roles.role_name })
        .from(user_roles)
        .where(eq(user_roles.id, userRecord.role_id))
        .limit(1)
        .catch((error) => {
          console.error('Error fetching user role record:', error);
          throw new InternalServerErrorException(
            'Failed to fetch user role record',
            {
              cause: error,
            },
          );
        });
      if (!RoleRecord) {
        console.log('User role not found', RoleRecord);
        throw new HttpException('User role not found', HttpStatus.NOT_FOUND);
      }
      console.log('Role found', RoleRecord);

      return await this.db.transaction(async (tx) => {
        console.log('Finding existing order item...');
        const [existingOrderItem] = await tx
          .select({
            id: order_items.id,
            order_id: order_items.order_id,
            order_status: order_items.order_status,
            product_variant_id: order_items.product_variant_id,
            quantity: order_items.quantity,
            price: order_items.price,
          })
          .from(order_items)
          .where(eq(order_items.id, orderItemId))
          .limit(1)
          .then((result) => {
            console.log('Role query result:', result);
            return result;
          })
          .catch((error) => {
            console.error('Error fetching order item:', error);
            throw new InternalServerErrorException(
              'Failed to fetch order item',
              {
                cause: error,
              },
            );
          });
        if (!existingOrderItem) {
          throw new HttpException('Order item not found', HttpStatus.NOT_FOUND);
        }
        console.log('Found existing order item...', existingOrderItem);

        if (
          !existingOrderItem.order_id ||
          !existingOrderItem.product_variant_id
        ) {
          throw new HttpException(
            'Order item has incomplete data',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
        if (existingOrderItem.order_status === OrderStatus.CANCELLED) {
          console.log(
            'Order item is already cancelled',
            existingOrderItem.order_status,
          );
          throw new HttpException(
            'Order item is already cancelled',
            HttpStatus.BAD_REQUEST,
          );
        }

        if (
          existingOrderItem.order_status === OrderStatus.SHIPPED ||
          existingOrderItem.order_status === OrderStatus.DELIVERED
        ) {
          console.log(
            `Order item is already ${existingOrderItem.order_status} and cannot be cancelled`,
            existingOrderItem.order_status,
          );
          throw new HttpException(
            `Order item is already ${existingOrderItem.order_status} and cannot be cancelled`,
            HttpStatus.BAD_REQUEST,
          );
        }
        console.log('searching main order...');
        const [order] = await tx
          .select({
            id: orders.id,
            total_amount: orders.total_amount,
            user_id: orders.user_id,
          })
          .from(orders)
          .where(
            and(
              eq(orders.id, existingOrderItem.order_id),
              eq(orders.company_id, companyId),
            ),
          )
          .limit(1)
          .catch((error) => {
            console.error('Error fetching order:', error);
            throw new InternalServerErrorException('Failed to fetch order', {
              cause: error,
            });
          });

        if (!order) {
          throw new HttpException(
            'Order not found or does not belong to this company',
            HttpStatus.NOT_FOUND,
          );
        }
        console.log('Found main order...', order);
        const allOrderItems = await tx
          .select({
            id: order_items.id,
            order_status: order_items.order_status,
            quantity: order_items.quantity,
            price: order_items.price,
          })
          .from(order_items)
          .where(
            and(
              eq(order_items.order_id, existingOrderItem.order_id),
              eq(order_items.company_id, companyId),
            ),
          )
          .catch((error) => {
            console.error('Error fetching order items:', error);
            throw new InternalServerErrorException(
              'Failed to fetch order items',
              {
                cause: error,
              },
            );
          });

        const hasShippedOrDelivered = allOrderItems.some((item) =>
          [OrderStatus.SHIPPED, OrderStatus.DELIVERED].includes(
            item.order_status as OrderStatus,
          ),
        );

        if (hasShippedOrDelivered) {
          throw new HttpException(
            'Cannot cancel: one or more items in this order have already been shipped or delivered',
            HttpStatus.BAD_REQUEST,
          );
        }
        console.log('serching paymtn record...');
        const [paymentRecord] = await tx
          .select({ id: payments.id })
          .from(payments)
          .where(eq(payments.order_id, existingOrderItem.order_id))
          .limit(1)
          .catch((error) => {
            console.error('Error fetching payment record:', error);
            throw new InternalServerErrorException(
              'Failed to fetch payment record',
              {
                cause: error,
              },
            );
          });
        if (!paymentRecord) {
          throw new HttpException(
            'Payment record not found for this order',
            HttpStatus.NOT_FOUND,
          );
        }
        console.log('found payemnt record', paymentRecord);
        const refundAmount =
          Number(existingOrderItem.price) * existingOrderItem.quantity;

        await tx
          .update(order_items)
          .set({ order_status: OrderStatus.CANCELLED })
          .where(eq(order_items.id, existingOrderItem.id))
          .catch((error) => {
            console.error(
              'Error updating order item status to cancelled:',
              error,
            );
            throw new InternalServerErrorException(
              'Failed to cancel order item',
              {
                cause: error,
              },
            );
          });
        await tx
          .insert(order_item_cancelled)
          .values({
            order_item_id: existingOrderItem.id,
            reason: cancelReason,
            cancelled_by: RoleRecord.role_name as CancelledByEnum,
            user_id: userRecord.id,
            company_id: companyId,
          })
          .catch((error) => {
            console.error('Error recording cancellation audit entry:', error);
            throw new InternalServerErrorException(
              'Failed to record cancellation audit entry',
              { cause: error },
            );
          });
        await this.inventoryService.rollbackStockForOrder(
          {
            variantId: existingOrderItem.product_variant_id,
            quantity: existingOrderItem.quantity,
          },
          companyId,
          tx as DrizzleService,
        );
        await tx
          .insert(refunds)
          .values({
            refund_amount: String(refundAmount),
            refund_reason: cancelReason,
            refund_status: refundStatusEnum.PENDING,
            order_id: existingOrderItem.order_id,
            order_items_id: existingOrderItem.id,
            payment_id: paymentRecord.id,
            company_id: companyId,
          })
          .catch((error) => {
            console.error('Error creating refund record:', error);
            throw new InternalServerErrorException(
              'Failed to create refund record',
              { cause: error },
            );
          });

        const remainingActiveItems = allOrderItems.filter(
          (item) =>
            item.id !== existingOrderItem.id &&
            item.order_status !== OrderStatus.CANCELLED,
        );

        const newOrderTotal = remainingActiveItems.reduce(
          (sum, item) => sum + Number(item.price) * item.quantity,
          0,
        );

        await tx
          .update(orders)
          .set({ total_amount: String(newOrderTotal) })
          .where(eq(orders.id, existingOrderItem.order_id))
          .catch((error) => {
            console.error('Error updating order total:', error);
            throw new InternalServerErrorException(
              'Failed to update order total',
              { cause: error },
            );
          });

        const allItemsNowCancelled = remainingActiveItems.length === 0;

        if (allItemsNowCancelled) {
          await tx
            .update(payments)
            .set({ payment_status: PaymentStatus.REFUNDED })
            .where(eq(payments.id, paymentRecord.id))
            .catch((error) => {
              console.error('Error updating payment status:', error);

              throw new InternalServerErrorException(
                'Failed to update payment status',
                { cause: error },
              );
            });
        }
        const [customerRecord] = await tx
          .select({ email: user.email, id: user.id })
          .from(user)
          .where(eq(user.id, order.user_id ?? ''))
          .limit(1);

        if (customerRecord?.email) {
          this.mailService
            .sendOrderCancellationEmail(
              customerRecord.email,
              existingOrderItem.order_id,
              cancelReason,
            )
            .catch((error) => {
              console.error(
                'Failed to send order cancellation email to customer',
                error,
              );
            });
        }
        return {
          message: 'Order item cancelled successfully',
          orderItemId,
          cancelledQuantity: existingOrderItem.quantity,
          refundAmount: String(refundAmount),
          refundStatus: refundStatusEnum.PENDING,
          newOrderTotal: String(newOrderTotal),
          orderFullyCancelled: allItemsNowCancelled,
        };
      });
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to cancel order', {
        cause: error,
      });
    }
  }
}
