import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { MailService } from 'src/common/services/mail/mail.service';
import { DRIZZLE, type DrizzleService } from 'src/drizzle/drizzle.module';
import {
  order_items,
  orders,
  payments,
  refunds,
  user,
} from 'src/drizzle/schema';
import {
  OrderStatus,
  PaymentStatus,
  refundStatusEnum,
} from 'src/drizzle/types/types';
import { CompanyService } from '../company/company.service';

@Injectable()
export class RefundsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly mailService: MailService,
    private readonly companyService: CompanyService,
  ) { }

  async initiateRefund({
    orderId,
    orderItemId,
    reason,
    domain,
  }: {
    orderId: string;
    orderItemId?: string;
    reason: string;
    domain: string;
  }) {
    try {
      // domain can be a domain string OR a company UUID (called internally from returns.service)
      const companyId = await this.companyService.find(domain);

      // ── 1. Validate order belongs to company ─────────────────────────
      const [order] = await this.db
        .select({
          id: orders.id,
          total_amount: orders.total_amount,
          user_id: orders.user_id,
        })
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.company_id, companyId)))
        .limit(1);

      if (!order) {
        throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
      }

      // ── 2. Resolve refund scope: single item OR whole order ───────────
      const isSingleItem = !!orderItemId;
      let refundAmount: string;
      let resolvedOrderItemId: string | undefined;

      if (isSingleItem) {
        // Fetch the specific order item to calculate its refund amount
        const [orderItem] = await this.db
          .select({
            id: order_items.id,
            price: order_items.price,
            quantity: order_items.quantity,
            order_id: order_items.order_id,
          })
          .from(order_items)
          .where(
            and(
              eq(order_items.id, orderItemId),
              eq(order_items.order_id, orderId), // ensure item belongs to this order
            ),
          )
          .limit(1);

        if (!orderItem) {
          throw new HttpException(
            'Order item not found or does not belong to this order',
            HttpStatus.NOT_FOUND,
          );
        }

        // ── Guard: no duplicate refund for this specific item ────────────
        const [existingItemRefund] = await this.db
          .select({ id: refunds.id, refund_status: refunds.refund_status })
          .from(refunds)
          .where(
            and(
              eq(refunds.order_items_id, orderItemId),
              eq(refunds.company_id, companyId),
            ),
          )
          .limit(1);

        if (existingItemRefund) {
          throw new HttpException(
            `A refund already exists for this item with status: ${existingItemRefund.refund_status}`,
            HttpStatus.BAD_REQUEST,
          );
        }

        // item refund amount = unit price × quantity
        refundAmount = (
          Number(orderItem.price) * orderItem.quantity
        ).toFixed(2);
        resolvedOrderItemId = orderItem.id;
      } else {
        // Whole-order refund — guard against duplicate order-level refund
        // (allow if only item-level refunds exist for other items)
        const [existingOrderRefund] = await this.db
          .select({ id: refunds.id, refund_status: refunds.refund_status })
          .from(refunds)
          .where(
            and(
              eq(refunds.order_id, orderId),
              eq(refunds.company_id, companyId),
              // A null order_items_id means it's an order-level refund
            ),
          )
          .limit(1);

        // Filter in JS: only block if an ORDER-LEVEL refund already exists
        // (item-level refunds on the same order are fine to coexist)
        const orderLevelExists = existingOrderRefund
          ? await this.db
            .select({ id: refunds.id, order_items_id: refunds.order_items_id })
            .from(refunds)
            .where(eq(refunds.id, existingOrderRefund.id))
            .limit(1)
            .then(([r]) => r?.order_items_id === null)
          : false;

        if (orderLevelExists) {
          throw new HttpException(
            `A full-order refund already exists with status: ${existingOrderRefund!.refund_status}`,
            HttpStatus.BAD_REQUEST,
          );
        }

        refundAmount = order.total_amount;
        resolvedOrderItemId = undefined;
      }

      // ── 3. Fetch payment record ───────────────────────────────────────
      const [paymentRecord] = await this.db
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.order_id, orderId))
        .limit(1);

      if (!paymentRecord) {
        throw new HttpException(
          'Payment record not found for this order',
          HttpStatus.NOT_FOUND,
        );
      }

      // ── 4. Create the refund record ───────────────────────────────────
      const [newRefund] = await this.db
        .insert(refunds)
        .values({
          refund_amount: refundAmount,
          refund_reason: reason,
          refund_status: refundStatusEnum.PENDING,
          order_id: orderId,
          order_items_id: resolvedOrderItemId ?? null, // null = whole-order refund
          payment_id: paymentRecord.id,
          company_id: companyId,
        })
        .returning();

      // ── 5. Notify customer ────────────────────────────────────────────
      if (order.user_id) {
        const [customerRecord] = await this.db
          .select({ email: user.email })
          .from(user)
          .where(eq(user.id, order.user_id))
          .limit(1);

        if (customerRecord?.email) {
          const scope = isSingleItem ? 'item' : 'order';
          await this.mailService.sendEmail(
            customerRecord.email,
            'Refund Initiated — Your Request Is Being Processed',
            `<div style="font-family: sans-serif; max-width: 600px; margin: auto;">
              <h2>Refund Initiated</h2>
              <p>A refund has been initiated for your ${scope}.</p>
              <table style="width:100%; border-collapse: collapse; margin: 16px 0;">
                <tr>
                  <td style="padding: 8px; border: 1px solid #eee; color: #666;">Order ID</td>
                  <td style="padding: 8px; border: 1px solid #eee;">${orderId}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #eee; color: #666;">Refund Amount</td>
                  <td style="padding: 8px; border: 1px solid #eee;">₹${refundAmount}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #eee; color: #666;">Reason</td>
                  <td style="padding: 8px; border: 1px solid #eee;">${reason}</td>
                </tr>
              </table>
              <p>The refund will be processed within <strong>3–5 business days</strong>.</p>
              <p style="color: #888; font-size: 12px;">
                If you did not request this, please contact our support team immediately.
              </p>
            </div>`,
          );
        }
      }

      return {
        message: isSingleItem
          ? 'Item refund initiated successfully'
          : 'Order refund initiated successfully',
        refundId: newRefund.id,
        refundAmount: newRefund.refund_amount,
        refundStatus: newRefund.refund_status,
        scope: isSingleItem ? 'item' : 'order',
        orderItemId: resolvedOrderItemId ?? null,
      };
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Error occurred while initiating refund',
        { cause: error },
      );
    }
  }

  // ── Get refund status for a specific order ───────────────────────────────
  async getRefundStatus(orderId: string, domain: string) {
    try {
      const companyId = await this.companyService.find(domain);

      const refundRecords = await this.db.query.refunds.findMany({
        where: and(
          eq(refunds.order_id, orderId),
          eq(refunds.company_id, companyId),
        ),
        with: {
          orderItem: {
            columns: {
              id: true,
              quantity: true,
              price: true,
              order_status: true,
            },
          },
          payment: {
            columns: {
              id: true,
              payment_method: true,
              payment_status: true,
              transaction_ref: true,
            },
          },
        },
      });

      if (!refundRecords || refundRecords.length === 0) {
        throw new HttpException(
          'No refunds found for this order',
          HttpStatus.NOT_FOUND,
        );
      }

      const totalRefundAmount = refundRecords.reduce(
        (sum, r) => sum + Number(r.refund_amount),
        0,
      );

      return {
        orderId,
        // clearly label whether each refund is item-level or order-level
        refunds: refundRecords.map((r) => ({
          refundId: r.id,
          refundAmount: r.refund_amount,
          refundReason: r.refund_reason,
          refundStatus: r.refund_status,
          scope: r.order_items_id ? 'item' : 'order',
          createdAt: r.created_at,
          orderItem: r.orderItem ?? null,
          payment: r.payment,
        })),
        totalRefundAmount,
      };
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Error occurred while fetching refund status',
        { cause: error },
      );
    }
  }

  // ── Mark a refund as processed (vendor confirms money sent) ─────────────
  async processRefund(refundId: string, domain: string) {
    try {
      const companyId = await this.companyService.find(domain);

      const [existingRefund] = await this.db
        .select()
        .from(refunds)
        .where(and(eq(refunds.id, refundId), eq(refunds.company_id, companyId)))
        .limit(1);

      if (!existingRefund) {
        throw new HttpException('Refund not found', HttpStatus.NOT_FOUND);
      }

      if (existingRefund.refund_status === refundStatusEnum.PROCESSED) {
        throw new HttpException(
          'Refund has already been processed',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (existingRefund.refund_status === refundStatusEnum.REJECTED) {
        throw new HttpException(
          'Cannot process a rejected refund',
          HttpStatus.BAD_REQUEST,
        );
      }

      return await this.db.transaction(async (tx) => {
        const [updatedRefund] = await tx
          .update(refunds)
          .set({ refund_status: refundStatusEnum.PROCESSED })
          .where(eq(refunds.id, refundId))
          .returning()
          .catch((error) => {
            throw new InternalServerErrorException(
              'Failed to update refund status',
              { cause: error },
            );
          });

        // Only mark payment as REFUNDED when it is a whole-order refund
        // For item-level refunds, payment stays as-is (partial refund scenario)
        const isOrderLevelRefund = existingRefund.order_items_id === null;
        if (existingRefund.payment_id && isOrderLevelRefund) {
          await tx
            .update(payments)
            .set({ payment_status: PaymentStatus.REFUNDED })
            .where(eq(payments.id, existingRefund.payment_id))
            .catch((error) => {
              throw new InternalServerErrorException(
                'Failed to update payment status',
                { cause: error },
              );
            });
        }

        // Notify customer
        if (existingRefund.order_id) {
          const [orderRecord] = await tx
            .select({ user_id: orders.user_id })
            .from(orders)
            .where(eq(orders.id, existingRefund.order_id))
            .limit(1);

          if (orderRecord?.user_id) {
            const [customerRecord] = await tx
              .select({ email: user.email })
              .from(user)
              .where(eq(user.id, orderRecord.user_id))
              .limit(1);

            if (customerRecord?.email) {
              await this.mailService.sendEmail(
                customerRecord.email,
                'Your Refund Has Been Processed',
                `<div style="font-family: sans-serif; max-width: 600px; margin: auto;">
                  <h2>Refund Processed</h2>
                  <p>Your refund of <strong>₹${updatedRefund.refund_amount}</strong> for order 
                  <strong>#${existingRefund.order_id.split('-')[0].toUpperCase()}</strong> 
                  has been successfully processed.</p>
                  <p>The amount will reflect in your account within <strong>3–5 business days</strong>.</p>
                </div>`,
              );
            }
          }
        }

        return {
          message: 'Refund processed successfully',
          refundId: updatedRefund.id,
          refundAmount: updatedRefund.refund_amount,
          refundStatus: updatedRefund.refund_status,
          scope: existingRefund.order_items_id ? 'item' : 'order',
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
        'Error occurred while processing refund',
        { cause: error },
      );
    }
  }

  async getCompanyRefunds(domain: string) {
    try {
      const companyId = await this.companyService.find(domain);

      const refundRecords = await this.db.query.refunds.findMany({
        where: eq(refunds.company_id, companyId),
        with: {
          order: {
            columns: {
              id: true,
              total_amount: true,
              user_id: true,
            },
          },
          orderItem: {
            columns: {
              id: true,
              quantity: true,
              price: true,
              order_status: true,
            },
          },
          payment: {
            columns: {
              id: true,
              payment_method: true,
              payment_status: true,
              transaction_ref: true,
              amount: true,
            },
          },
        },
      });

      return {
        total: refundRecords.length,
        totalPendingAmount: refundRecords
          .filter((r) => r.refund_status === refundStatusEnum.PENDING)
          .reduce((sum, r) => sum + Number(r.refund_amount), 0),
        // split into item-level and order-level for dashboard clarity
        itemRefunds: refundRecords.filter((r) => r.order_items_id !== null),
        orderRefunds: refundRecords.filter((r) => r.order_items_id === null),
        refunds: refundRecords
          .map((r) => ({ ...r, scope: r.order_items_id ? 'item' : 'order' }))
          .sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime(),
          ),
      };
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Error occurred while fetching company refunds',
        { cause: error },
      );
    }
  }
}