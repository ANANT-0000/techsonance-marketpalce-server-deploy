import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { and, eq, or } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from 'src/drizzle/drizzle.module';
import {
  company,
  order_item_cancelled,
  order_items,
  orders,
  payments,
  product_images,
  refunds,
  user,
} from 'src/drizzle/schema';
import {
  CancelledByEnum,
  OrderStatus,
  PaymentStatus,
  refundStatusEnum,
} from 'src/drizzle/types/types';
import { CompanyService } from '../company/company.service';
import { InventoryService } from '../inventory/inventory.service';
import { MailService } from 'src/common/services/mail/mail.service';

@Injectable()
export class OrdersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
    private readonly inventoryService: InventoryService,
    private readonly mailService: MailService,
  ) {}

  async createOrder({
    userId,
    companyId,
    addressId,
    orderLines,
    paymentMethod,
  }: {
    userId: string;
    companyId: string;
    addressId: string;
    orderLines: { variantId: string; quantity: number; price: number }[];
    paymentMethod: string;
  }) {
    try {
      const totalAmount = orderLines.reduce(
        (acc, line) => acc + line.price * line.quantity,
        0,
      );
      if (totalAmount <= 0) {
        throw new Error('Total amount must be greater than zero');
      }
      const orderResult = await this.db.transaction(async (tx) => {
        await this.inventoryService.deductStockForOrder(
          orderLines.map((l) => ({
            variantId: l.variantId,
            quantity: l.quantity,
          })),
          companyId,
          tx as DrizzleService,
        );

        const [createdOrder] = await tx
          .insert(orders)
          .values({
            user_id: userId,
            company_id: companyId,
            address_id: addressId,
            total_amount: String(totalAmount),
          })
          .returning({
            id: orders.id,
          })
          .catch((error) => {
            console.error('Error inserting order:', error);
            throw new InternalServerErrorException('Failed to create order', {
              cause: error,
            });
          });
        const orderItemsData = orderLines.map((line) => ({
          order_id: createdOrder.id,
          product_variant_id: line.variantId,
          quantity: line.quantity,
          price: String(line.price),
          order_status: OrderStatus.PENDING,
        }));
        await tx
          .insert(order_items)
          .values(orderItemsData)
          .catch((error) => {
            console.error('Error inserting order items:', error);
            throw new InternalServerErrorException(
              'Failed to create order items',
              {
                cause: error,
              },
            );
          });
        console.log('creating payment ');
        await tx
          .insert(payments)
          .values({
            order_id: createdOrder.id,
            company_id: companyId,
            amount: String(totalAmount),
            payment_status: PaymentStatus.PENDING,
            payment_method: paymentMethod,
            transaction_ref: `txn_${createdOrder.id}_${Date.now()}`,
          })
          .then((result) => {
            console.log('payment record created', result);
          })
          .catch((error) => {
            console.error('Error inserting payment record:', error);
            throw new InternalServerErrorException(
              'Failed to create payment record',
              {
                cause: error,
              },
            );
          });
        return {
          orderId: createdOrder.id,
          totalAmount: String(totalAmount),
          itemCount: orderLines.length,
        };
      });
      return orderResult;
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to create order', {
        cause: error,
      });
    }
  }
  async getOrderById(orderId: string, domain?: string) {
    try {
      if (!orderId || !domain) {
        throw new HttpException(
          'Order ID and Domain are required',
          HttpStatus.BAD_REQUEST,
        );
      }
      const [companyRecord] = await this.db
        .select({ id: company.id })
        .from(company)
        .where(or(eq(company.company_domain, domain), eq(company.id, domain)))
        .limit(1)
        .catch((error) => {
          console.error('Error fetching company record:', error);
          throw new InternalServerErrorException(
            'Failed to fetch company record',
            {
              cause: error,
            },
          );
        });
      if (!companyRecord) {
        throw new HttpException('Company not found', HttpStatus.NOT_FOUND);
      }
      const [orderResult] = await this.db.query.orders.findMany({
        where: and(
          eq(orders.id, orderId),
          eq(orders.company_id, companyRecord.id),
        ),
        with: {
          items: true,
        },
      });

      if (!orderResult || !orderResult.items) {
        throw new HttpException(
          'Order not found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }
      // if (orderResult.order_status === OrderStatus.PENDING) {
      //   throw new BadRequestException(
      //     'Order is still pending. Please complete the checkout process.',
      //   );
      // }

      return orderResult;
    } catch (error) {
      console.error('Error fetching order:', error);
      throw new InternalServerErrorException('Failed to fetch order', {
        cause: error,
      });
    }
  }
  async completeOrderVerification(
    orderId: string,
    isSuccess: boolean,
    companyId?: string,
  ): Promise<{ success: boolean; orderId: string; message: string }> {
    if (!orderId) {
      throw new HttpException('Order ID is required', HttpStatus.BAD_REQUEST);
    }
    if (!companyId) {
      throw new HttpException('Company ID is required', HttpStatus.BAD_REQUEST);
    }
    try {
      const [existingOrder] = await this.db
        .select({ id: orders.id })
        .from(orders)
        .where((eq(orders.id, orderId), eq(orders.company_id, companyId)))
        .limit(1);
      if (!existingOrder) {
        throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
      }
      const orderLines = await this.db
        .select({
          variantId: order_items.product_variant_id,
          quantity: order_items.quantity,
        })
        .from(order_items)
        .where(eq(order_items.order_id, orderId));

      console.log('starting transaction of order complete');
      return this.db.transaction(async (tx) => {
        if (isSuccess) {
          const orderItemsRecord = await tx
            .select({ id: order_items.id })
            .from(order_items)
            .where(eq(order_items.order_id, orderId))
            .limit(1);
          if (orderItemsRecord.length === 0) {
            const updateItem = orderItemsRecord.map(async (item) => {
              return await tx
                .update(order_items)
                .set({ order_status: OrderStatus.PROCESSING })
                .where(
                  and(
                    eq(order_items.order_id, orderId),
                    eq(order_items.id, item.id),
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
            });
            const updateResults = await Promise.all(updateItem);
            console.log('order items updated to processing', updateResults);
          }
          await tx
            .update(payments)
            .set({ payment_status: PaymentStatus.COMPLETED })
            .where(eq(payments.order_id, existingOrder.id))
            .then((result) => {
              console.log('payment status updated to completed', result);
            })
            .catch((error) => {
              console.error('Error updating payment status:', error);
              throw new InternalServerErrorException(
                'Failed to update payment status',
                {
                  cause: error,
                },
              );
            });
          return {
            success: true,
            orderId,
            message: 'Order placed successfully',
          };
        } else {
          await this.inventoryService.rollbackStockForOrder(
            orderLines.map((l) => ({
              variantId: l.variantId ?? '',
              quantity: l.quantity,
            })),
            companyId,
            tx as DrizzleService,
          );
          const orderItemsRecord = await tx
            .select({ id: order_items.id })
            .from(order_items)
            .where(eq(order_items.order_id, orderId))
            .limit(1);
          if (orderItemsRecord.length === 0) {
            const updateItem = orderItemsRecord.map(async (item) => {
              return await tx
                .update(order_items)
                .set({ order_status: OrderStatus.CANCELLED })
                .where(
                  and(
                    eq(order_items.order_id, orderId),
                    eq(order_items.id, item.id),
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
            });
            const updateResults = await Promise.all(updateItem);
            console.log('order items updated to cancelled', updateResults);
          }
          await tx
            .update(payments)
            .set({ payment_status: PaymentStatus.FAILED })
            .where(eq(payments.order_id, existingOrder.id))
            .then((result) => {
              console.log('payment status updated to failed', result);
            })
            .catch((error) => {
              console.error('Error updating payment status:', error);
              throw new InternalServerErrorException(
                'Failed to update payment status',
                {
                  cause: error,
                },
              );
            });
          return {
            success: false,
            orderId: existingOrder.id,
            message: 'Payment failed. Order has been cancelled.',
          };
        }
      });
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        console.error('Error completing order verification:', error);
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to complete order verification',
        {
          cause: error,
        },
      );
    }
  }

  async getUserOrders(userId: string, domain: string) {
    try {
      if (!userId) {
        throw new HttpException('User ID is required', HttpStatus.BAD_REQUEST);
      }
      const [companyRecord] = await this.db
        .select({ id: company.id })
        .from(company)
        .where(or(eq(company.company_domain, domain), eq(company.id, domain)))
        .limit(1)
        .catch((error) => {
          console.error('Error fetching company record:', error);
          throw new InternalServerErrorException(
            'Failed to fetch company record',
            {
              cause: error,
            },
          );
        });
      if (!companyRecord) {
        throw new HttpException('Company not found', HttpStatus.NOT_FOUND);
      }

      const ordersList = await this.db.query.orders.findMany({
        where: and(
          eq(orders.user_id, userId),
          eq(orders.company_id, companyRecord.id),
        ),
        columns: {
          id: true,
          user_id: true,
          total_amount: true,
          order_status: true,
          created_at: true,
        },
        with: {
          items: {
            columns: {
              quantity: true,
              price: true,
            },
            with: {
              productVariant: {
                columns: {
                  id: true,
                  variant_name: true,
                  price: true,
                },
                with: {
                  images: {
                    where: eq(product_images.is_primary, true),
                    columns: {
                      image_url: true,
                    },
                  },
                },
              },
            },
          },
          address: {
            columns: {
              name: true,
              address_line_1: true,
              address_line_2: true,
              city: true,
              state: true,
              postal_code: true,
              country: true,
            },
          },
          payment: {
            columns: {
              id: true,
              amount: true,
              payment_status: true,
              payment_method: true,
              transaction_ref: true,
            },
          },
          shipping: {
            columns: {
              tracking_url: true,
            },
          },
        },
      });

      // console.log('user orders \n', ordersList);
      return ordersList;
    } catch (error) {
      console.error('Error fetching user orders:', error);
      throw new InternalServerErrorException('Failed to retrieve user orders', {
        cause: error,
      });
    }
  }
  async getUserOrderDetails(orderId: string, domain: string) {
    try {
      if (!orderId || !domain) {
        throw new HttpException(
          'Order ID and domain are required',
          HttpStatus.BAD_REQUEST,
        );
      }
      const [companyRecord] = await this.db
        .select({ id: company.id })
        .from(company)
        .where(or(eq(company.company_domain, domain), eq(company.id, domain)))
        .limit(1)
        .catch((error) => {
          console.error('Error fetching company record:', error);
          throw new InternalServerErrorException(
            'Failed to fetch company record',
            {
              cause: error,
            },
          );
        });
      if (!companyRecord) {
        throw new HttpException('Company not found', HttpStatus.NOT_FOUND);
      }
      const orderDetails = await this.db.query.orders.findFirst({
        where: and(
          eq(orders.id, orderId),
          eq(orders.company_id, companyRecord.id),
        ),
        columns: {
          id: true,
          user_id: true,
          total_amount: true,
          order_status: true,
          created_at: true,
        },
        with: {
          items: {
            columns: {
              quantity: true,
              price: true,
            },
            with: {
              productVariant: {
                columns: {
                  id: true,
                  variant_name: true,
                  price: true,
                },
                with: {
                  images: {
                    where: eq(product_images.is_primary, true),
                    columns: {
                      image_url: true,
                    },
                  },
                },
              },
            },
          },
          address: {
            columns: {
              name: true,
              address_line_1: true,
              address_line_2: true,
              city: true,
              state: true,
              postal_code: true,
              country: true,
            },
          },
          payment: true,
          shipping: {
            columns: {
              tracking_url: true,
            },
          },
        },
      });
      if (!orderDetails) {
        throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
      }
      return orderDetails;
    } catch (error) {
      console.error('Error fetching order details:', error);
      throw new InternalServerErrorException(
        'Failed to retrieve order details',
        {
          cause: error,
        },
      );
    }
  }
  async getOrdersList(domain: string) {
    try {
      const [companyRecord] = await this.db
        .select({ id: company.id })
        .from(company)
        .where(or(eq(company.company_domain, domain), eq(company.id, domain)))
        .limit(1)
        .catch((error) => {
          console.error('Error fetching company record:', error);
          throw new InternalServerErrorException(
            'Failed to fetch company record',
            {
              cause: error,
            },
          );
        });
      if (!companyRecord) {
        throw new HttpException('Company not found', HttpStatus.NOT_FOUND);
      }
      const ordersList = await this.db.query.orders.findMany({
        where: and(eq(orders.company_id, companyRecord.id)),
        columns: {
          id: true,
          total_amount: true,
          order_status: true,
          created_at: true,
        },

        with: {
          items: {
            columns: {
              quantity: true,
              price: true,
            },
          },
          address: {
            columns: {
              name: true,
              city: true,
              state: true,
              country: true,
              postal_code: true,
            },
          },
          payment: true,
        },
      });
      return ordersList.sort(
        (a, b) => b.created_at.getTime() - a.created_at.getTime(),
      );
    } catch (error) {
      console.error('Error fetching orders list:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to retrieve orders list', {
        cause: error,
      });
    }
  }
  async getOrderDetails(orderId: string, domain: string) {
    try {
      if (!orderId || !domain) {
        throw new HttpException(
          'Order ID and domain are required',
          HttpStatus.BAD_REQUEST,
        );
      }
      const [companyRecord] = await this.db
        .select({ id: company.id })
        .from(company)
        .where(or(eq(company.company_domain, domain), eq(company.id, domain)))
        .limit(1)
        .catch((error) => {
          console.error('Error fetching company record:', error);
          throw new InternalServerErrorException(
            'Failed to fetch company record',
            {
              cause: error,
            },
          );
        });

      const orderDetails = await this.db.query.orders.findFirst({
        where: and(
          eq(orders.id, orderId),
          eq(orders.company_id, companyRecord.id),
        ),
        columns: {
          id: true,
          order_status: true,
          total_amount: true,
          created_at: true,
        },
        with: {
          items: {
            columns: {
              quantity: true,
              price: true,
            },

            with: {
              productVariant: {
                columns: {
                  id: true,
                  variant_name: true,
                  price: true,
                },
                with: {
                  images: {
                    where: eq(product_images.is_primary, true),
                    columns: {
                      image_url: true,
                    },
                  },
                },
              },
            },
          },
          customer: {
            columns: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
              phone_number: true,
            },
          },
          address: {
            columns: {
              name: true,
              address_line_1: true,
              address_line_2: true,
              city: true,
              state: true,
              postal_code: true,
              country: true,
            },
          },
          payment: true,
          shipping: {
            columns: {
              tracking_url: true,
            },
          },
        },
      });
      return orderDetails;
    } catch (error) {
      console.error('Error fetching order details:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to retrieve order details',
        {
          cause: error,
        },
      );
    }
  }
  async setOrderStatus(
    orderId: string,
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
      const [existingOrder] = await this.db
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.company_id, companyId)))
        .limit(1);
      if (!existingOrder) {
        throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
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
      const orderItemsRecord = await this.db
        .select({ id: order_items.id })
        .from(order_items)
        .where(eq(order_items.order_id, orderId))
        .limit(1);
      if (orderItemsRecord.length === 0) {
        const updateItem = orderItemsRecord.map(async (item) => {
          return await this.db
            .update(order_items)
            .set({ order_status: newStatus.toLowerCase() as OrderStatus })
            .where(
              and(
                eq(order_items.order_id, orderId),
                eq(order_items.id, item.id),
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
        });
        const updateResults = await Promise.all(updateItem);
        console.log('order items updated to processing', updateResults);
      }
      return orderId;
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

  async cancelOrder(
    orderItemId: string,
    cancelReason: string,
    cancelledBy: CancelledByEnum,
    domain: string,
  ) {
    try {
      const companyId = await this.companyService.find(domain);

      return await this.db.transaction(async (tx) => {
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
          .limit(1);

        if (!existingOrderItem) {
          throw new HttpException('Order item not found', HttpStatus.NOT_FOUND);
        }

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
          throw new HttpException(
            'Order item is already cancelled',
            HttpStatus.BAD_REQUEST,
          );
        }

        if (existingOrderItem.order_status === OrderStatus.DELIVERED) {
          throw new HttpException(
            'Order item is already delivered and cannot be cancelled',
            HttpStatus.BAD_REQUEST,
          );
        }

        if (existingOrderItem.order_status === OrderStatus.SHIPPED) {
          throw new HttpException(
            'Order item has already been shipped and cannot be cancelled',
            HttpStatus.BAD_REQUEST,
          );
        }
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
          .limit(1);

        if (!order) {
          throw new HttpException(
            'Order not found or does not belong to this company',
            HttpStatus.NOT_FOUND,
          );
        }
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
          );

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
        const [paymentRecord] = await tx
          .select({ id: payments.id })
          .from(payments)
          .where(eq(payments.order_id, existingOrderItem.order_id))
          .limit(1);

        if (!paymentRecord) {
          throw new HttpException(
            'Payment record not found for this order',
            HttpStatus.NOT_FOUND,
          );
        }
        const refundAmount =
          Number(existingOrderItem.price) * existingOrderItem.quantity;
        await tx
          .update(order_items)
          .set({ order_status: OrderStatus.CANCELLED })
          .where(eq(order_items.id, existingOrderItem.id))
          .catch((error) => {
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
            cancelled_by: cancelledBy,
            company_id: companyId,
          })
          .catch((error) => {
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
