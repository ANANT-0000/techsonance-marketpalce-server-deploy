import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { and, desc, eq, gt, inArray, or } from 'drizzle-orm';
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
import { response } from 'express';

@Injectable()
export class OrdersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
    private readonly inventoryService: InventoryService,
    private readonly mailService: MailService,
  ) { }

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
        console.log('creating order ...');
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
        console.log('Order created:', createdOrder);
        const orderItemsData = orderLines.map((line) => ({
          order_id: createdOrder.id,
          product_variant_id: line.variantId,
          quantity: line.quantity,
          price: String(line.price),
          order_status: OrderStatus.PENDING,
          company_id: companyId,
        }));
        console.log('creating order item...');
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
        console.log('created order item...');

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
      const companyId = await this.companyService.find(domain);

      const [orderResult] = await this.db.query.orders.findMany({
        where: and(eq(orders.id, orderId), eq(orders.company_id, companyId)),
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
    customerDetails: { email: string, first_name: string, last_name: string },
    existingOrder: {
      id: string;
      total_amount: string;
      created_at: Date;
      updated_at: Date;
      user_id: string | null;
      address_id: string | null;
      company_id: string | null;
    },
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
    console.log('order id in completeOrderVerification', orderId)
    try {
      if (!existingOrder || !existingOrder.user_id) {
        throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
      }
      console.log("===================")
      console.log("existingOrder", existingOrder)
      console.log("===================")
      const orderLines = await this.db
        .select({
          variantId: order_items.product_variant_id,
          quantity: order_items.quantity,
        })
        .from(order_items)
        .where(eq(order_items.order_id, orderId));
      console.log('starting transaction of order complete,cusomter detials', customerDetails);
      return this.db.transaction(async (tx) => {
        if (isSuccess) {
          const orderItemsRecord = await tx
            .select()
            .from(order_items)
            .where(eq(order_items.order_id, orderId))
          console.log('===================')
          console.log('orderItemsRecord', orderItemsRecord)
          console.log('===================')

          if (orderItemsRecord.length > 0) {
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
          if (!orderItemsRecord[0].order_id) {
            throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
          }
          const paymentResult = await tx
            .update(payments)
            .set({ payment_status: PaymentStatus.COMPLETED })
            .where(eq(payments.order_id, orderItemsRecord[0].order_id)).returning()
            .then((result) => {
              console.log('payment status updated to completed', result);
              return result
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
          console.log('===================')
          console.log('paymentResult', paymentResult)
          console.log('===================')
          if (customerDetails.email) {
            this.mailService.sendOrderPlacedEmail(customerDetails.email, `${customerDetails.first_name} ${customerDetails.last_name}`, orderId, Number(existingOrder.total_amount));
          }
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
      const companyId = await this.companyService.find(domain);

      const ordersList = await this.db.query.orders
        .findMany({
          orderBy: desc(orders.created_at),
          where: and(
            eq(orders.user_id, userId),
            eq(orders.company_id, companyId),
          ),
          columns: {
            id: true,
            user_id: true,
            total_amount: true,
            created_at: true,
          },
          with: {
            items: {
              columns: {
                order_status: true,
                quantity: true,
                price: true,
              },
              with: {
                variant: {
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
                return_request: {
                  columns: {
                    id: true,
                    status: true,
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
        })
        .catch((error) => {
          console.error('Error fetching user orders:', error);
          throw new InternalServerErrorException(
            'Failed to retrieve user orders',
            {
              cause: error,
            },
          );
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
  async getUserOrderDetails(orderId: string, domain: string, offset: number = 0, limit: number = 10, status?: OrderStatus) {
    try {
      if (!orderId || !domain) {
        throw new HttpException(
          'Order ID and domain are required',
          HttpStatus.BAD_REQUEST,
        );
      }
      const companyId = await this.companyService.find(domain);

      const orderDetails = await this.db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.company_id, companyId)),
        columns: {
          id: true,
          user_id: true,
          total_amount: true,
          created_at: true,
        },
        with: {
          items: {
            columns: {
              id: true,
              quantity: true,
              order_status: true,
              price: true,
            },
            with: {
              variant: {
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
              return_request: {
                columns: {
                  id: true,
                  status: true,
                  store_owner_note: true,
                  tracking_id: true,
                  type: true
                }
              },
              cancelledRecord: true
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
      console.log('order details \n', orderDetails.payment);
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
  async getOrdersList(domain: string, offset: number = 0, limit: number = 50, status?: OrderStatus | undefined) {
    try {
      const companyId = await this.companyService.find(domain);
      console.log('order status \n', status, Object.values(OrderStatus).includes(status as OrderStatus))

      // Step 1: Get order IDs that have matching items (for proper pagination)
      const validOrderIdsQuery = this.db
        .selectDistinct({ id: orders.id, created_at: orders.created_at })
        .from(orders)
        .innerJoin(
          order_items,
          and(
            eq(order_items.order_id, orders.id),
            Object.values(OrderStatus).includes(status as OrderStatus)
              ? and(
                // @ts-ignore
                eq(order_items.order_status, status),
                gt(order_items.quantity, 0)
              )
              : undefined
          )
        )
        .where(eq(orders.company_id, companyId))
        .orderBy(desc(orders.created_at))
        .limit(limit)
        .offset(offset);

      const validOrderIds = (await validOrderIdsQuery).map((o) => o.id);

      if (validOrderIds.length === 0) {
        return [];
      }

      // Step 2: Fetch full data only for those orders
      const ordersList = await this.db.query.orders.findMany({
        where: and(
          eq(orders.company_id, companyId),
          inArray(orders.id, validOrderIds)
        ),
        orderBy: desc(orders.created_at),
        columns: {
          id: true,
          total_amount: true,
          created_at: true,
        },
        with: {
          items: {
            where: Object.values(OrderStatus).includes(status as OrderStatus)
              ? and(
                // @ts-ignore
                eq(order_items.order_status, status),
                gt(order_items.quantity, 0)
              )
              : undefined,
            columns: {
              order_status: true,
              quantity: true,
              price: true,
            },
            with: {
              cancelledRecord: true,
              return_request: true,
              order: {
                with: {
                  payment: true,
                },
              },
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
      console.log(ordersList)
      return ordersList
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
      const companyId = await this.companyService.find(domain);
      const row = await this.db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.company_id, companyId)),

        columns: {
          id: true,
          total_amount: true,
          created_at: true,
        },
        with: {
          items: {
            columns: {
              id: true,
              order_status: true,
              quantity: true,
              price: true,
            },
            with: {
              return_request: true,
              cancelledRecord: true,
              refund: true,
              variant: {
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
                  inventory: {
                    columns: {
                      stock_quantity: true,
                      warehouse_id: true,
                    },
                    with: {
                      warehouse: {
                        columns: {
                          warehouse_name: true,
                          address_id: true,
                        },
                        with: {
                          address: {
                            columns: {
                              address_line_1: true,
                              address_line_2: true,
                              city: true,
                              state: true,
                              postal_code: true,
                              country: true,
                            },
                          },
                        },
                      },
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
      if (!row) {
        throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
      }
      console.log(row);
      const warehouseIds = new Set(
        row.items.map((i) => i?.variant?.inventory?.warehouse_id ?? null),
      );
      const isSingleWarehouse = warehouseIds.size <= 1;

      const formattedOrderDetails = {
        id: row.id,
        total_amount: row.total_amount,
        created_at: row.created_at,
        is_single_warehouse: isSingleWarehouse,
        customer: {
          id: row.customer?.id ?? null,
          first_name: row.customer?.first_name ?? null,
          last_name: row.customer?.last_name ?? null,
          email: row.customer?.email ?? null,
          phone_number: row.customer?.phone_number ?? null,
        },
        items: row.items.map((item) => {
          const inventory = item?.variant?.inventory ?? null;
          const warehouse = inventory?.warehouse ?? null;

          return {
            id: item.id,
            quantity: item?.quantity,
            unit_price: item?.price, // renamed: price → unit_price (clearer)
            line_total: (Number(item?.price) * item?.quantity).toFixed(2), // pre-computed
            order_status: item?.order_status,
            refund: item?.refund,
            return: item?.return_request,
            cancel: item?.cancelledRecord,
            warehouse: warehouse
              ? {
                id: inventory?.warehouse_id ?? null,
                name: warehouse.warehouse_name,
                address: warehouse.address
                  ? {
                    address_line_1: warehouse.address.address_line_1,
                    address_line_2:
                      warehouse.address.address_line_2 ?? null,
                    city: warehouse.address.city,
                    state: warehouse.address.state,
                    postal_code: warehouse.address.postal_code,
                    country: warehouse.address.country,
                  }
                  : null,
              }
              : null,

            product_variant: {
              id: item.variant?.id ?? null,
              variant_name: item.variant?.variant_name ?? null,
              price: item.variant?.price ?? null,
              image_url: item.variant?.images?.[0]?.image_url ?? null, // flattened: no array needed
            },
          };
        }),

        shipping_address: row.address
          ? {
            name: row.address.name,
            address_line_1: row.address.address_line_1,
            address_line_2: row.address.address_line_2 ?? null,
            city: row.address.city,
            state: row.address.state,
            postal_code: row.address.postal_code,
            country: row.address.country,
          }
          : null,

        payment: row.payment
          ? {
            amount: row.payment.amount,
            payment_method: row.payment.payment_method,
          }
          : null,
        shipping: {
          tracking_url: row.shipping?.tracking_url ?? null,
        },
      };
      console.log('formattedOrderDetails', formattedOrderDetails.items);
      return formattedOrderDetails;
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
      console.log('find items...');
      const orderItemsRecord = await this.db
        .select({ id: order_items.id })
        .from(order_items)
        .where(eq(order_items.order_id, orderId))
        .limit(1);
      console.log('orderItemsRecord', orderItemsRecord);
      if (orderItemsRecord) {
        console.log('updating item statuses...');
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
            .then((result) => {
              console.log(
                `order item ${item.id} updated to ${newStatus}`,
                result,
              );
            })
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
  async getPendingOrders(domain: string) {
    try {
      const companyId = await this.companyService.find(domain)
      const result = await this.db.query.orders.findMany({
        where: eq(orders.company_id, companyId),
        with: {
          items: {
            where: or(eq(order_items.order_status, OrderStatus.PENDING), eq(order_items.order_status, OrderStatus.PROCESSING)),
            columns: {
              id: true,
              order_id: true,
              order_status: true,
              created_at: true,
              updated_at: true,
            }
          }
        }
      });
      const reponse = result.map(order => (
        order.items
      )).flat()
      console.log(response)
      return reponse
    } catch (error) {
      console.error('Error fetching pending orders:', error);
      throw new InternalServerErrorException('Failed to fetch pending orders', {
        cause: error,
      });
    }
  }
}
