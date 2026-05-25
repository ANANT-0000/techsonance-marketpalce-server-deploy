import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { MailService } from '../../common/services/mail/mail.service';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import {
  order_items,
  orders,
  payments,
  refunds,
  user,
} from '../../drizzle/schema';
import {
  OrderStatus,
  PaymentStatus,
  RefundStatusEnum,
} from '../../drizzle/types/types';
import { CompanyService } from '../company/company.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';

@Injectable()
export class RefundsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly mailService: MailService,
    private readonly companyService: CompanyService,
  ) {}

  private async resolveCompanyId(domain: string): Promise<string> {
    console.log(
      `[RefundsService.resolveCompanyId] Resolving company for domain: ${domain}`,
    );
    const filteredDomain = domainExtractor(domain);
    console.log(
      `[RefundsService.resolveCompanyId] Extracted filter domain: ${filteredDomain}`,
    );
    console.log(
      '[RefundsService.resolveCompanyId] Querying CompanyService.find(...)',
    );
    return this.companyService.find(filteredDomain);
  }

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
      console.log('[RefundsService.initiateRefund] Request received', {
        orderId,
        orderItemId,
        domain,
      });
      console.log('[RefundsService.initiateRefund] Resolving company id');
      // domain can be a domain string OR a company UUID (called internally from returns.service)
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        `[RefundsService.initiateRefund] Company ID resolved: ${companyId}`,
      );

      // ── 1. Validate order belongs to company ─────────────────────────
      console.log(
        '[RefundsService.initiateRefund] Querying order for refund scope validation',
      );
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
      console.log(
        '[RefundsService.initiateRefund] Order found, determining refund scope',
      );

      // ── 2. Resolve refund scope: single item OR whole order ───────────
      const isSingleItem = !!orderItemId;
      let refundAmount: string;
      let resolvedOrderItemId: string | undefined;

      if (isSingleItem) {
        console.log(
          '[RefundsService.initiateRefund] Processing item-level refund',
        );
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
        console.log(
          '[RefundsService.initiateRefund] Checking for existing item-level refund',
        );
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
        refundAmount = (Number(orderItem.price) * orderItem.quantity).toFixed(
          2,
        );
        resolvedOrderItemId = orderItem.id;
        console.log(
          `[RefundsService.initiateRefund] Item refund amount calculated: ${refundAmount}`,
        );
      } else {
        console.log(
          '[RefundsService.initiateRefund] Processing order-level refund',
        );
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
              .select({
                id: refunds.id,
                order_items_id: refunds.order_items_id,
              })
              .from(refunds)
              .where(eq(refunds.id, existingOrderRefund.id))
              .limit(1)
              .then(([r]) => r?.order_items_id === null)
          : false;

        if (orderLevelExists) {
          throw new HttpException(
            `A full-order refund already exists with status: ${existingOrderRefund.refund_status}`,
            HttpStatus.BAD_REQUEST,
          );
        }

        refundAmount = order.total_amount;
        resolvedOrderItemId = undefined;
        console.log(
          `[RefundsService.initiateRefund] Order refund amount resolved: ${refundAmount}`,
        );
      }

      // ── 3. Fetch payment record ───────────────────────────────────────
      console.log('[RefundsService.initiateRefund] Querying payment record');
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
      console.log('[RefundsService.initiateRefund] Creating refund record');
      const [newRefund] = await this.db
        .insert(refunds)
        .values({
          refund_amount: refundAmount,
          refund_reason: reason,
          refund_status: RefundStatusEnum.PENDING,
          order_id: orderId,
          order_items_id: resolvedOrderItemId ?? null, // null = whole-order refund
          payment_id: paymentRecord.id,
          company_id: companyId,
        })
        .returning();
      console.log(
        '[RefundsService.initiateRefund] Refund record created successfully',
      );

      // ── 5. Notify customer ────────────────────────────────────────────
      if (order.user_id) {
        console.log(
          '[RefundsService.initiateRefund] Resolving customer email for notification',
        );
        const [customerRecord] = await this.db
          .select({ email: user.email })
          .from(user)
          .where(eq(user.id, order.user_id))
          .limit(1);

        if (customerRecord?.email) {
          console.log(
            '[RefundsService.initiateRefund] Sending refund initiation email',
          );
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

      console.log(
        '[RefundsService.initiateRefund] Refund initiation completed',
      );
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
      console.log('[RefundsService.getRefundStatus] Request received', {
        orderId,
        domain,
      });
      console.log('[RefundsService.getRefundStatus] Resolving company id');
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        `[RefundsService.getRefundStatus] Querying refunds for order_id: ${orderId}`,
      );

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
      console.log(
        `[RefundsService.getRefundStatus] Retrieved ${refundRecords.length} refund record(s)`,
      );

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
      console.log(
        `[RefundsService.processRefund] Request to process refund: ${refundId}`,
      );
      console.log('[RefundsService.processRefund] Resolving company id');
      const companyId = await this.resolveCompanyId(domain);
      const [existingRefund] = await this.db
        .select()
        .from(refunds)
        .where(and(eq(refunds.id, refundId), eq(refunds.company_id, companyId)))
        .limit(1);
      console.log('[RefundsService.processRefund] Refund record located');
      if (!existingRefund) {
        throw new HttpException('Refund not found', HttpStatus.NOT_FOUND);
      }

      if (existingRefund.refund_status === RefundStatusEnum.PROCESSED) {
        throw new HttpException(
          'Refund has already been processed',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (existingRefund.refund_status === RefundStatusEnum.REJECTED) {
        throw new HttpException(
          'Cannot process a rejected refund',
          HttpStatus.BAD_REQUEST,
        );
      }
      console.log(
        '[RefundsService.processRefund] Starting database transaction',
      );
      return await this.db.transaction(async (tx) => {
        console.log(
          '[RefundsService.processRefund] Updating refund status to PROCESSED',
        );
        const [updatedRefund] = await tx
          .update(refunds)
          .set({ refund_status: RefundStatusEnum.PROCESSED })
          .where(eq(refunds.id, refundId))
          .returning()
          .catch((error) => {
            throw new InternalServerErrorException(
              'Failed to update refund status',
              { cause: error },
            );
          });
        console.log(
          '[RefundsService.processRefund] Refund status updated successfully',
        );

        const isOrderLevelRefund = existingRefund.order_items_id === null;
        if (existingRefund.payment_id && isOrderLevelRefund) {
          console.log(
            '[RefundsService.processRefund] Updating payment status to REFUNDED',
          );
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
          console.log(
            '[RefundsService.processRefund] Resolving customer email for refund notification',
          );
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
              console.log(
                '[RefundsService.processRefund] Sending refund processed email',
              );
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

        console.log(
          '[RefundsService.processRefund] Refund processing completed',
        );
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
      console.log('[RefundsService.getCompanyRefunds] Request received', {
        domain,
      });
      console.log('[RefundsService.getCompanyRefunds] Resolving company id');
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        `[RefundsService.getCompanyRefunds] Querying refunds for company_id: ${companyId}`,
      );

      // 1. Fetch raw data
      const refundRecords = await this.db.query.refunds.findMany({
        where: eq(refunds.company_id, companyId),
        with: {
          order: {
            columns: {
              id: true,
              total_amount: true,
              user_id: true,
            },
            with: {
              customer: {
                columns: {
                  id: true,
                  first_name: true,
                  last_name: true,
                  email: true,
                },
              },
            },
          },
          orderItem: {
            columns: {
              id: true,
              quantity: true,
              price: true,
              order_status: true,
            },
            with: {
              cancelledRecord: {
                columns: {
                  id: true,
                  reason: true,
                  cancelled_by: true,
                },
              },
              return_request: {
                columns: {
                  id: true,
                  type: true,
                  status: true,
                  created_at: true,
                  updated_at: true,
                },
              },
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

      const formattedRefunds = refundRecords.map((r) => ({
        ...r,
        scope: r.order_items_id ? 'item' : 'order',
        order_id: r.order_id,
      }));
      const reponse = {
        total: formattedRefunds.length,
        totalPendingAmount: formattedRefunds
          .filter((r) => r.refund_status === RefundStatusEnum.PENDING)
          .reduce((sum, r) => sum + Number(r.refund_amount), 0),
        itemRefunds: formattedRefunds.filter((r) => r.scope === 'item'),
        orderRefunds: formattedRefunds.filter((r) => r.scope === 'order'),
        refunds: formattedRefunds.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        ),
      };
      console.log(
        `[RefundsService.getCompanyRefunds] Retrieved ${formattedRefunds.length} refund record(s)`,
      );
      return reponse;
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
