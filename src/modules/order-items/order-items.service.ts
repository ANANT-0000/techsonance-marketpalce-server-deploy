import { orderItemCancelledRelations } from './../../drizzle/schema/index';
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
import { and, asc, desc, eq, inArray, SQL } from 'drizzle-orm';
import { address, user } from '../../drizzle/schema/users.schema';
import { user_and_company, user_roles } from '../../drizzle/schema';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { OrderItemsErrorKeyEnum } from './constants/order-items.enums';

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
    const companyId = await this.companyService.find(filteredDomain);
    return companyId;
  }

  async getOrderItemDetails(orderItemId: string, domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const itemExists = await this.db
        .select({ id: order_items.id })
        .from(order_items)
        .where(eq(order_items.id, orderItemId));
      if (!itemExists.length) {
        throw new HttpException(
          OrderItemsErrorKeyEnum.ORDER_ITEM_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
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
          throw new InternalServerErrorException(
            OrderItemsErrorKeyEnum.FAILED_TO_FETCH_ORDER_ITEM_DETAILS,
            {
              cause: error,
            },
          );
        });
      if (!orderItem) {
        throw new HttpException(
          OrderItemsErrorKeyEnum.ORDER_ITEM_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }
      return orderItem;
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        OrderItemsErrorKeyEnum.FAILED_TO_FETCH_ORDER_ITEM_DETAILS,
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
        throw new HttpException(
          OrderItemsErrorKeyEnum.ORDER_ITEM_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
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
          OrderItemsErrorKeyEnum.ORDER_NOT_FOUND_FOR_THE_ITEM,
          HttpStatus.NOT_FOUND,
        );
      }
      if (
        Object.values(OrderStatus).includes(
          newStatus.toLowerCase() as OrderStatus,
        )
      ) {
      } else {
        throw new HttpException(
          OrderItemsErrorKeyEnum.INVALID_ORDER_STATUS_VALUE,
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
          throw new InternalServerErrorException(
            OrderItemsErrorKeyEnum.FAILED_TO_UPDATE_ORDER_STATUS,
            {
              cause: error,
            },
          );
        });
      return { message: 'Order item status updated successfully' };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        OrderItemsErrorKeyEnum.FAILED_TO_UPDATE_ORDER_STATUS,
        {
          cause: error,
        },
      );
    }
  }
  async getUserOrderItems(
    userId: string,
    domain: string,
    filters?: {
      offset: number;
      limit: number;
      status?: OrderStatus;
      date?: string;
      sortby: 'asc' | 'desc';
    },
  ) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      if (!userId) {
        throw new HttpException(
          OrderItemsErrorKeyEnum.USER_ID_IS_REQUIRED,
          HttpStatus.BAD_REQUEST,
        );
      }
      const userOrders = await this.db
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(eq(orders.user_id, userId), eq(orders.company_id, companyId)),
        );
      if (!userOrders.length) {
        return [];
      }

      const whereCause: SQL[] = [];
      if (
        filters?.status &&
        Object.values(OrderStatus).includes(filters.status)
      ) {
        whereCause.push(eq(order_items.order_status, filters.status));
      }
      const orderByCause =
        filters?.sortby === 'asc'
          ? asc(order_items.created_at)
          : desc(order_items.created_at);

      return await this.db.query.order_items
        .findMany({
          limit: filters?.limit ?? 10,
          offset: filters?.offset ?? 0,
          where: and(
            inArray(
              order_items.order_id,
              userOrders.map((order) => order.id),
            ),
            ...whereCause,
          ),
          orderBy: orderByCause,
          columns: {
            order_status: true,
            quantity: true,
            price: true,
          },
          with: {
            order: {
              columns: { id: true, total_amount: true, created_at: true },
              with: {
                address: {
                  columns: {
                    name: true,
                    address_line_1: true,

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
              },
            },
            variant: {
              columns: { id: true, variant_name: true, price: true },
              with: {
                images: {
                  where: eq(product_images.is_primary, true),
                  columns: { image_url: true },
                },
              },
            },
            return_request: { columns: { id: true, status: true } },
          },
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            OrderItemsErrorKeyEnum.FAILED_TO_RETRIEVE_USER_ORDERS,
            { cause: error },
          );
        });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        OrderItemsErrorKeyEnum.FAILED_TO_FETCH_USER_ORDER_ITEMS,
        {
          cause: error,
        },
      );
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
      const companyId = await this.resolveCompanyId(domain);
      const [userRecord] = await this.db
        .select({ role_id: user_and_company.role_id, id: user.id })
        .from(user)
        .innerJoin(user_and_company, eq(user.id, user_and_company.user_id))
        .where(eq(user.id, userId))
        .limit(1)
        .catch((error) => {
          throw new InternalServerErrorException(
            OrderItemsErrorKeyEnum.FAILED_TO_FETCH_USER_RECORD,
            {
              cause: error,
            },
          );
        });
      if (!userRecord || !userRecord.role_id) {
        throw new HttpException(
          OrderItemsErrorKeyEnum.USER_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }
      const [RoleRecord] = await this.db
        .select({ role_id: user_roles.id, role_name: user_roles.role_name })
        .from(user_roles)
        .where(eq(user_roles.id, userRecord.role_id))
        .limit(1)
        .catch((error) => {
          throw new InternalServerErrorException(
            OrderItemsErrorKeyEnum.FAILED_TO_FETCH_USER_ROLE_RECORD,
            {
              cause: error,
            },
          );
        });
      if (!RoleRecord) {
        throw new HttpException(
          OrderItemsErrorKeyEnum.USER_ROLE_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }

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
          .limit(1)
          .then((result) => {
            return result;
          })
          .catch((error) => {
            throw new InternalServerErrorException(
              OrderItemsErrorKeyEnum.FAILED_TO_FETCH_ORDER_ITEM,
              {
                cause: error,
              },
            );
          });
        if (!existingOrderItem) {
          throw new HttpException(
            OrderItemsErrorKeyEnum.ORDER_ITEM_NOT_FOUND,
            HttpStatus.NOT_FOUND,
          );
        }

        if (
          !existingOrderItem.order_id ||
          !existingOrderItem.product_variant_id
        ) {
          throw new HttpException(
            OrderItemsErrorKeyEnum.ORDER_ITEM_HAS_INCOMPLETE_DATA,
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
        if (existingOrderItem.order_status === OrderStatus.CANCELLED) {
          throw new HttpException(
            OrderItemsErrorKeyEnum.ORDER_ITEM_IS_ALREADY_CANCELLED,
            HttpStatus.BAD_REQUEST,
          );
        }

        if (
          existingOrderItem.order_status === OrderStatus.SHIPPED ||
          existingOrderItem.order_status === OrderStatus.DELIVERED
        ) {
          throw new HttpException(
            `Order item is already ${existingOrderItem.order_status} and cannot be cancelled`,
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
          .limit(1)
          .catch((error) => {
            throw new InternalServerErrorException(
              OrderItemsErrorKeyEnum.FAILED_TO_FETCH_ORDER,
              {
                cause: error,
              },
            );
          });

        if (!order) {
          throw new HttpException(
            OrderItemsErrorKeyEnum.ORDER_NOT_FOUND_OR_DOES_NOT_BELONG_TO_THIS_COMPANY,
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
          )
          .catch((error) => {
            throw new InternalServerErrorException(
              OrderItemsErrorKeyEnum.FAILED_TO_FETCH_ORDER_ITEMS,
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
            OrderItemsErrorKeyEnum.CANNOT_CANCEL_ONE_OR_MORE_ITEMS_IN_THIS_ORDER_HAVE_ALREADY_BEEN_SHIPPED_OR_DELIVERED,
            HttpStatus.BAD_REQUEST,
          );
        }
        const [paymentRecord] = await tx
          .select({ id: payments.id, payment_method: payments.payment_method })
          .from(payments)
          .where(eq(payments.order_id, existingOrderItem.order_id))
          .limit(1)
          .catch((error) => {
            throw new InternalServerErrorException(
              OrderItemsErrorKeyEnum.FAILED_TO_FETCH_PAYMENT_RECORD,
              {
                cause: error,
              },
            );
          });
        if (!paymentRecord) {
          throw new HttpException(
            OrderItemsErrorKeyEnum.PAYMENT_RECORD_NOT_FOUND_FOR_THIS_ORDER,
            HttpStatus.NOT_FOUND,
          );
        }
        const refundAmount =
          Number(existingOrderItem.price) * existingOrderItem.quantity;
        const isPrepaid = paymentRecord.payment_method !== 'COD';
        await tx
          .update(order_items)
          .set({ order_status: OrderStatus.CANCELLED })
          .where(eq(order_items.id, existingOrderItem.id))
          .catch((error) => {
            throw new InternalServerErrorException(
              OrderItemsErrorKeyEnum.FAILED_TO_CANCEL_ORDER_ITEM,
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
            throw new InternalServerErrorException(
              OrderItemsErrorKeyEnum.FAILED_TO_RECORD_CANCELLATION_AUDIT_ENTRY,
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
        if (isPrepaid) {
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
              throw new InternalServerErrorException(
                OrderItemsErrorKeyEnum.FAILED_TO_CREATE_REFUND_RECORD,
                { cause: error },
              );
            });
        }
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
              OrderItemsErrorKeyEnum.FAILED_TO_UPDATE_ORDER_TOTAL,
              { cause: error },
            );
          });

        const allItemsNowCancelled = remainingActiveItems.length === 0;

        if (allItemsNowCancelled) {
          const finalPaymentStatus = isPrepaid
            ? PaymentStatus.REFUNDED
            : PaymentStatus.CANCELLED;
          await tx
            .update(payments)
            .set({ payment_status: finalPaymentStatus })
            .where(eq(payments.id, paymentRecord.id))
            .catch((error) => {
              throw new InternalServerErrorException(
                OrderItemsErrorKeyEnum.FAILED_TO_UPDATE_PAYMENT_STATUS,
                { cause: error },
              );
            });
        }
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
          await this.mailService.sendOrderCancelledEmail(
            customerRecord.email,
            `${customerRecord.first_name} ${customerRecord.last_name} `,
            order.id,
            true,
          );
        }
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
      throw new InternalServerErrorException(
        OrderItemsErrorKeyEnum.FAILED_TO_CANCEL_ORDER,
        {
          cause: error,
        },
      );
    }
  }
}
