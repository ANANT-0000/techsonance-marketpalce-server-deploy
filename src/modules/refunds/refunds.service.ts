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
  ) {}

  // ── Called from vendor dashboard to manually initiate a refund ──
  // Note: cancelOrder() in orders.service already auto-creates a refund record.
  // This method is for cases where the vendor wants to manually trigger one
  // (e.g. item lost in transit, goodwill refund, etc.)
  async initiateRefund({
    orderId,
    reason,
    domain,
  }: {
    orderId: string;
    reason: string;
    domain: string;
  }) {
    try {
      const companyId = await this.companyService.find(domain);

      // Validate order exists and belongs to company
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

      // Check no refund already exists for this order
      const [existingRefund] = await this.db
        .select({ id: refunds.id, refund_status: refunds.refund_status })
        .from(refunds)
        .where(
          and(eq(refunds.order_id, orderId), eq(refunds.company_id, companyId)),
        )
        .limit(1);

      if (existingRefund) {
        throw new HttpException(
          `A refund already exists for this order with status: ${existingRefund.refund_status}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      // Fetch payment for this order
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

      // Create the refund record
      const [newRefund] = await this.db
        .insert(refunds)
        .values({
          refund_amount: order.total_amount,
          refund_reason: reason,
          refund_status: refundStatusEnum.PENDING,
          order_id: orderId,
          payment_id: paymentRecord.id,
          company_id: companyId,
        })
        .returning();

      // Send notification email to customer
      if (order.user_id) {
        const [customerRecord] = await this.db
          .select({ email: user.email })
          .from(user)
          .where(eq(user.id, order.user_id))
          .limit(1);

        if (customerRecord?.email) {
          await this.mailService.sendOrderCancellationEmail(
            customerRecord.email,
            orderId,
            reason,
          );
        }
      }

      return {
        message: 'Refund initiated successfully',
        refundId: newRefund.id,
        refundAmount: newRefund.refund_amount,
        refundStatus: newRefund.refund_status,
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

  // ── Get refund status for a specific order ───────────────────────
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

      return {
        orderId,
        refunds: refundRecords.map((r) => ({
          refundId: r.id,
          refundAmount: r.refund_amount,
          refundReason: r.refund_reason,
          refundStatus: r.refund_status,
          createdAt: r.created_at,
          orderItem: r.orderItem,
          payment: r.payment,
        })),
        totalRefundAmount: refundRecords.reduce(
          (sum, r) => sum + Number(r.refund_amount),
          0,
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
        'Error occurred while fetching refund status',
        { cause: error },
      );
    }
  }

  // ── Mark a refund as processed (vendor confirms money sent) ──────
  async processRefund(refundId: string, domain: string) {
    try {
      const companyId = await this.companyService.find(domain);

      // Fetch the refund
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
        // Mark refund as processed
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

        // Update linked payment to refunded
        if (existingRefund.payment_id) {
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

        // Notify customer by email
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
                `<p>Your refund of ₹${updatedRefund.refund_amount} for order 
                 <strong>${existingRefund.order_id}</strong> has been 
                 successfully processed.</p>
                 <p>The amount will reflect in your account within 3–5 business days.</p>`,
              );
            }
          }
        }

        return {
          message: 'Refund processed successfully',
          refundId: updatedRefund.id,
          refundAmount: updatedRefund.refund_amount,
          refundStatus: updatedRefund.refund_status,
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
        refunds: refundRecords.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
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
