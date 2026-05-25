import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import {
  CancelledByEnum,
  OrderStatus,
  PaymentStatus,
  productImageType,
  RefundStatusEnum,
} from '../../drizzle/types/types';
import { CompanyService } from '../company/company.service';
import { InventoryService } from '../inventory/inventory.service';
import { MailService } from '../../common/services/mail/mail.service';
import {
  order_item_cancelled,
  order_items,
  orders,
  payments,
  product_images,
  refunds,
} from '../../drizzle/schema/shop.schema';
import { and, eq } from 'drizzle-orm';
import { user } from '../../drizzle/schema/users.schema';
import { user_and_company, user_roles } from '../../drizzle/schema';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';

@Injectable()
export class OrderItemsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
    private readonly inventoryService: InventoryService,
    private readonly mailService: MailService,
  ) {}

  private async resolveCompanyId(domain: string): Promise<string> {
    const filteredDomain = domainExtractor(domain);
    console.log(
      `[OrderItemsService.resolveCompanyId] Resolving company for domain: ${domain}`,
    );
    console.log(
      `[OrderItemsService.resolveCompanyId] Extracted filter domain: ${filteredDomain}`,
    );
    console.log(
      '[OrderItemsService.resolveCompanyId] Querying CompanyService.find(...)',
    );
    const companyId = await this.companyService.find(filteredDomain);
    console.log(
      `[OrderItemsService.resolveCompanyId] Company resolved: ${companyId}`,
    );
    return companyId;
  }

  async getOrderItemDetails(orderItemId: string, domain: string) {
    try {
      console.log(
        '[OrderItemsService.getOrderItemDetails] Starting order item lookup',
        {
          orderItemId,
          domain,
        },
      );
      const companyId = await this.resolveCompanyId(domain);
      console.log('[OrderItemsService.getOrderItemDetails] Company resolved', {
        companyId,
      });
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
      console.log(
        '[OrderItemsService.getOrderItemDetails] Order item details loaded',
        {
          orderItemId,
        },
      );
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
    console.log(
      '[OrderItemsService.setOrderItemStatus] Starting status update',
      {
        itemId,
        newStatus,
        domain,
      },
    );
    const companyId = await this.resolveCompanyId(domain);
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
      console.log('[OrderItemsService.setOrderItemStatus] Order item located', {
        itemId: existingItem.id,
        orderId: existingItem.order_id,
      });
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
      console.log(
        '[OrderItemsService.setOrderItemStatus] Order verified for item',
        {
          orderId: isOrderExist.id,
          companyId,
        },
      );
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
      console.log(
        '[OrderItemsService.setOrderItemStatus] Order item status updated',
        {
          itemId: existingItem.id,
          orderId: isOrderExist.id,
          newStatus: newStatus.toLowerCase(),
          affectedRows: orderItemUpdated,
        },
      );
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
        '[OrderItemsService.cancelOrder] Cancellation request received',
        {
          orderItemId,
          userId,
          domain,
          cancelReason,
        },
      );
      const companyId = await this.resolveCompanyId(domain);
      console.log('[OrderItemsService.cancelOrder] Company resolved', {
        companyId,
      });
      console.log('[OrderItemsService.cancelOrder] Loading user record');
      const [userRecord] = await this.db
        .select({ role_id: user_and_company.role_id, id: user.id })
        .from(user)
        .innerJoin(user_and_company, eq(user.id, user_and_company.user_id))
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
      console.log('[OrderItemsService.cancelOrder] User record loaded', {
        userId: userRecord.id,
        roleId: userRecord.role_id,
      });
      console.log('[OrderItemsService.cancelOrder] Loading role record');
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
      console.log('[OrderItemsService.cancelOrder] Role record loaded', {
        roleId: RoleRecord.role_id,
        roleName: RoleRecord.role_name,
      });

      return await this.db.transaction(async (tx) => {
        console.log('[OrderItemsService.cancelOrder] Transaction started');
        console.log(
          '[OrderItemsService.cancelOrder] Fetching order item inside transaction',
        );
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
        console.log('[OrderItemsService.cancelOrder] Order item loaded', {
          orderItemId: existingOrderItem.id,
          orderId: existingOrderItem.order_id,
          status: existingOrderItem.order_status,
        });

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
            '[OrderItemsService.cancelOrder] Order item already cancelled',
            {
              orderItemId: existingOrderItem.id,
            },
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
            '[OrderItemsService.cancelOrder] Order item cannot be cancelled',
            {
              orderItemId: existingOrderItem.id,
              status: existingOrderItem.order_status,
            },
          );
          throw new HttpException(
            `Order item is already ${existingOrderItem.order_status} and cannot be cancelled`,
            HttpStatus.BAD_REQUEST,
          );
        }
        console.log('[OrderItemsService.cancelOrder] Loading parent order');
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
        console.log('[OrderItemsService.cancelOrder] Parent order loaded', {
          orderId: order.id,
          totalAmount: order.total_amount,
        });
        console.log(
          '[OrderItemsService.cancelOrder] Loading all order items for cancellation checks',
        );
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
        console.log(
          '[OrderItemsService.cancelOrder] Order items loaded for validation',
          {
            itemCount: allOrderItems.length,
          },
        );

        const hasShippedOrDelivered = allOrderItems.some((item) =>
          [OrderStatus.SHIPPED, OrderStatus.DELIVERED].includes(
            item.order_status as OrderStatus,
          ),
        );

        if (hasShippedOrDelivered) {
          console.log(
            '[OrderItemsService.cancelOrder] Cancellation blocked because another item is already shipped or delivered',
            { orderId: order.id },
          );
          throw new HttpException(
            'Cannot cancel: one or more items in this order have already been shipped or delivered',
            HttpStatus.BAD_REQUEST,
          );
        }
        console.log('[OrderItemsService.cancelOrder] Loading payment record');
        const [paymentRecord] = await tx
          .select({ id: payments.id, payment_method: payments.payment_method })
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
        console.log('[OrderItemsService.cancelOrder] Payment record loaded', {
          paymentId: paymentRecord.id,
          paymentMethod: paymentRecord.payment_method,
        });
        const refundAmount =
          Number(existingOrderItem.price) * existingOrderItem.quantity;
        const isPrepaid = paymentRecord.payment_method !== 'COD';
        console.log(
          '[OrderItemsService.cancelOrder] Marking order item as cancelled',
          {
            orderItemId: existingOrderItem.id,
          },
        );
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
        console.log(
          '[OrderItemsService.cancelOrder] Writing cancellation audit record',
        );
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
        console.log(
          '[OrderItemsService.cancelOrder] Rolling back inventory for cancelled item',
          {
            variantId: existingOrderItem.product_variant_id,
            quantity: existingOrderItem.quantity,
          },
        );
        await this.inventoryService.rollbackStockForOrder(
          {
            variantId: existingOrderItem.product_variant_id,
            quantity: existingOrderItem.quantity,
          },
          companyId,
          tx as DrizzleService,
        );
        if (isPrepaid) {
          console.log(
            '[OrderItemsService.cancelOrder] Creating refund record for prepaid order',
            {
              refundAmount: String(refundAmount),
            },
          );
          await tx
            .insert(refunds)
            .values({
              refund_amount: String(refundAmount),
              refund_reason: cancelReason,
              refund_status: RefundStatusEnum.PENDING,
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
        }
        const remainingActiveItems = allOrderItems.filter(
          (item) =>
            item.id !== existingOrderItem.id &&
            item.order_status !== OrderStatus.CANCELLED,
        );

        console.log(
          '[OrderItemsService.cancelOrder] Recalculating order total',
          {
            remainingActiveItems: remainingActiveItems.length,
          },
        );
        const newOrderTotal = remainingActiveItems.reduce(
          (sum, item) => sum + Number(item.price) * item.quantity,
          0,
        );

        console.log('[OrderItemsService.cancelOrder] Updating order total', {
          orderId: existingOrderItem.order_id,
          newOrderTotal: String(newOrderTotal),
        });
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
          const finalPaymentStatus = isPrepaid
            ? PaymentStatus.REFUNDED
            : PaymentStatus.CANCELLED;
          console.log(
            '[OrderItemsService.cancelOrder] All items cancelled, updating payment status',
            {
              paymentId: paymentRecord.id,
              finalPaymentStatus,
            },
          );
          await tx
            .update(payments)
            .set({ payment_status: finalPaymentStatus })
            .where(eq(payments.id, paymentRecord.id))
            .catch((error) => {
              console.error('Error updating payment status:', error);

              throw new InternalServerErrorException(
                'Failed to update payment status',
                { cause: error },
              );
            });
        }
        console.log(
          '[OrderItemsService.cancelOrder] Checking whether cancellation email should be sent',
        );
        const [customerRecord] = await tx
          .select({
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
          })
          .from(user)
          .where(eq(user.id, order.user_id ?? ''))
          .limit(1);

        if (customerRecord?.email) {
          console.log(
            '[OrderItemsService.cancelOrder] Sending cancellation email',
            {
              email: customerRecord.email,
              orderId: order.id,
            },
          );
          await this.mailService.sendOrderCancelledEmail(
            customerRecord.email,
            `${customerRecord.first_name} ${customerRecord.last_name} `,
            order.id,
            true,
          );
        }
        console.log(
          '[OrderItemsService.cancelOrder] Cancellation transaction completed',
          {
            orderItemId,
            refundAmount: String(refundAmount),
            orderFullyCancelled: allItemsNowCancelled,
          },
        );
        return {
          message: 'Order item cancelled successfully',
          orderItemId,
          cancelledQuantity: existingOrderItem.quantity,
          refundAmount: String(refundAmount),
          refundStatus: RefundStatusEnum.PENDING,
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
