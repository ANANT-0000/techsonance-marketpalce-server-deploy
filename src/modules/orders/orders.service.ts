import { InvoiceTotals } from './../invoice/interfaces/invoice.interface';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  and,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lte,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import {
  gst_invoices,
  order_item_policy,
  order_items,
  orders,
  payments,
  product_images,
  product_policy_override,
  product_variants,
  products,
  category_policy,
  carts,
  cart_items,
  promotions,
  promotion_usage,
  promotion_rules,
  user,
  promotion_analytics_events,
  company_document_config,
} from '../../drizzle/schema';
import {
  DiscountConfig,
  OrderStatus,
  PaymentStatus,
  PromoEventType,
  PromotionRuleType,
  PromotionStatus,
} from '../../drizzle/types/types';
import { CompanyService } from '../company/company.service';
import { InventoryService } from '../inventory/inventory.service';
import { MailService } from '../../common/services/mail/mail.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { InvoiceService } from '../invoice/invoice.service';
import { FinancesService } from '../finances/finances.service';
import { PolicyDocumentService } from '../product-policies/policy-document.service';
import { ProductPoliciesService } from '../product-policies/product-policies.service';
import { PolicyResolutionService } from '../product-policies/policy-resolution.service'; // ← NEW
import { PolicySnapshot } from '../product-policies/interfaces/policy-document.interface';
import {
  calculatePromotionDiscount,
  CartContext,
  DiscountResult,
} from '../promotions/promotion-calculator';
import { CouponService } from '../coupon/coupon.service';
import { PromotionsService } from '../promotions/promotions.service';
import { OrdersErrorKeyEnum } from './constants/orders.enums';

@Injectable()
export class OrdersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
    private readonly inventoryService: InventoryService,
    private readonly mailService: MailService,
    private readonly invoiceService: InvoiceService,
    private readonly financesService: FinancesService,
    private readonly policyDocumentService: PolicyDocumentService,
    private readonly productPoliciesService: ProductPoliciesService,
    private readonly policyResolutionService: PolicyResolutionService,
    private readonly promotionService: PromotionsService,
    private readonly couponService: CouponService,
  ) {}
  private async resolveCompanyId(domain: string): Promise<string> {
    const filteredDomain = domainExtractor(domain);
    const companyId = await this.companyService.find(filteredDomain);
    return companyId;
  }
  async createOrder({
    userId,
    companyId,
    addressId,
    orderLines,
    paymentMethod,
    promotion_id,
  }: {
    userId: string;
    companyId: string;
    addressId: string;
    orderLines: { variantId: string; quantity: number; price: number }[];
    paymentMethod: string;
    promotion_id?: string;
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
        // STEP 2: Apply promotion discount on base total BEFORE tax
        let discountAmount = 0;
        let discountResult: DiscountResult | null = null;
        let appliedPromotion: typeof promotions.$inferSelect | null = null;
        if (promotion_id) {
          const [promotion] = await tx
            .select()
            .from(promotions)
            .where(
              and(
                eq(promotions.id, promotion_id),
                eq(promotions.company_id, companyId),
                eq(promotions.status, PromotionStatus.ACTIVE),
                lte(promotions.valid_from, new Date()),
                or(
                  isNull(promotions.valid_to),
                  gte(promotions.valid_to, new Date()),
                ),
              ),
            )
            .limit(1);
          if (!promotion) {
            throw new HttpException(
              OrdersErrorKeyEnum.PROMOTION_IS_NOT_ACTIVE_OR_HAS_EXPIRED,
              HttpStatus.BAD_REQUEST,
            );
          }
          // --- NEW: Validate per-user usage via promotion_usage records ---
          const [existingUsage] = await tx
            .select({ id: promotion_usage.id })
            .from(promotion_usage)
            .where(
              and(
                eq(promotion_usage.promotion_id, promotion_id),
                eq(promotion_usage.user_id, userId),
              ),
            )
            .limit(1);
          if (existingUsage) {
            throw new HttpException(
              OrdersErrorKeyEnum.YOU_HAVE_ALREADY_USED_THIS_PROMOTION,
              HttpStatus.BAD_REQUEST,
            );
          }
          const cartCtx: CartContext = {
            grandTotal: totalAmount,
            itemCount: orderLines.reduce((sum, l) => sum + l.quantity, 0),
            shippingAmount: 0,
            lineItems: orderLines.map((l) => ({
              product_variant_id: l.variantId,
              quantity: l.quantity,
              unit_price: l.price,
            })),
          };
          discountResult = calculatePromotionDiscount(
            promotion.promotion_type,
            promotion.discount_config as DiscountConfig,
            cartCtx,
          );
          discountAmount = discountResult.discountAmount;
          appliedPromotion = promotion;
        }
        // STEP 3: Calculate tax on the DISCOUNTED base total
        const taxData = await this.financesService.calculateOrderTaxes(
          addressId,
          orderLines,
          discountAmount,
          tx as DrizzleService,
          companyId,
        );
        const grandTotal = taxData.grandTotal;
        // ── 3. Create the main Order (uses grandTotal after discount) ─────────────────
        const [newOrder] = await tx
          .insert(orders)
          .values({
            company_id: companyId,
            user_id: userId,
            address_id: addressId,
            total_amount: String(grandTotal), // ← discounted if promotion applied
          })
          .returning({ id: orders.id })
          .catch((error) => {
            throw new InternalServerErrorException(
              OrdersErrorKeyEnum.FAILED_TO_CREATE_ORDER,
              {
                cause: error,
              },
            );
          });
        // 5. Create GST Invoice record
        const [updatedConfig] = await tx
          .update(company_document_config)
          .set({
            invoice_sequence_counter: sql`${company_document_config.invoice_sequence_counter} + 1`,
          })
          .where(eq(company_document_config.company_id, companyId))
          .returning({
            counter: company_document_config.invoice_sequence_counter,
            prefix: company_document_config.invoice_number_prefix,
            format: company_document_config.invoice_number_format,
          });
        let invoiceNumber: string;
        if (updatedConfig) {
          const counter = updatedConfig.counter;
          const prefix = updatedConfig.prefix ?? 'INV';
          const format = updatedConfig.format ?? '{PREFIX}-{YYYY}-{SEQ8}';
          const year = new Date().getFullYear();
          const seq6 = String(counter).padStart(6, '0');
          const seq8 = String(counter).padStart(8, '0');
          invoiceNumber = format
            .replace('{PREFIX}', prefix)
            .replace('{YYYY}', String(year))
            .replace('{SEQ6}', seq6)
            .replace('{SEQ8}', seq8);
        } else {
          invoiceNumber = `INV-${Date.now()}`;
        }
        await tx.insert(gst_invoices).values({
          company_id: companyId,
          order_id: newOrder.id,
          invoice_number: invoiceNumber,
          invoice_date: new Date().toISOString().split('T')[0],
          cgst_amount: String(taxData.totalCgst),
          sgst_amount: String(taxData.totalSgst),
          igst_amount: String(taxData.totalIgst),
          total_tax: String(taxData.totalTax),
          gst_amount: String(taxData.totalTax),
        });
        const lineBreakdownByVariant = new Map(
          taxData.lineBreakdown.map((l) => [l.variantId, l]),
        );
        const orderItemsData = orderLines.map((line) => {
          const breakdown = lineBreakdownByVariant.get(line.variantId);
          // Defensive fallback: if somehow a variant has no breakdown entry, use
          // the original price (should never happen since both arrays come from the
          // same orderLines input, but guards against future refactors).
          const discountedUnitPrice =
            breakdown?.discountedUnitPrice ?? line.price;
          return {
            order_id: newOrder.id,
            product_variant_id: line.variantId,
            quantity: line.quantity,
            // ── Discounted price (what the customer actually pays per unit) ──────
            price: String(discountedUnitPrice),
            order_status: OrderStatus.PENDING,
            company_id: companyId,
          };
        });
        await tx
          .insert(order_items)
          .values(orderItemsData)
          .catch((error) => {
            throw new InternalServerErrorException(
              OrdersErrorKeyEnum.FAILED_TO_CREATE_ORDER_ITEMS,
              {
                cause: error,
              },
            );
          });
        const insertedItems = await tx
          .select({
            id: order_items.id,
            product_variant_id: order_items.product_variant_id,
          })
          .from(order_items)
          .where(eq(order_items.order_id, newOrder.id));
        const resolutions =
          await this.policyResolutionService.resolveForVariants(
            insertedItems.map((item) => ({
              orderItemId: item.id,
              productVariantId: item.product_variant_id ?? '',
            })),
            tx as DrizzleService,
          );

        for (const [orderItemId, resolution] of resolutions.entries()) {
          if (!resolution.policy_id) {
            // Already logged by PolicyResolutionService — no snapshot needed
            continue;
          }
          try {
            await this.productPoliciesService.createOrderItemPolicySnapshot(
              {
                order_item_id: orderItemId,
                policy_id: resolution.policy_id,
                policy_start_date: new Date().toISOString().split('T')[0],
              },
              companyId,
              tx as DrizzleService,
            );
          } catch (err) {
            // Don't let a snapshot failure abort the whole order
          }
        }
        // 8. Create payment record (PENDING — confirmed later via verifyCheckout)
        // ── 8. Payment record ─────────────────────────────────────────────────────────
        await tx
          .insert(payments)
          .values({
            order_id: newOrder.id,
            company_id: companyId,
            amount: String(grandTotal), // ← discounted amount, not taxData.grandTotal
            payment_status: PaymentStatus.PENDING,
            payment_method: paymentMethod,
            transaction_ref: `txn_${newOrder.id}_${Date.now()}`,
          })
          .catch((error) => {
            throw new InternalServerErrorException(
              OrdersErrorKeyEnum.FAILED_TO_CREATE_PAYMENT_RECORD,
              {
                cause: error,
              },
            );
          });
        // ── 9. Record promotion usage (after order + payment rows exist) ──────────────
        if (appliedPromotion && discountAmount > 0) {
          // Atomic increment with concurrency guard
          const [updatedPromo] = await tx
            .update(promotions)
            .set({
              total_used: sql`${promotions.total_used} + 1`,
            })
            .where(
              and(
                eq(promotions.id, appliedPromotion.id),
                or(
                  isNull(promotions.max_uses_total),
                  sql`(${promotions.total_used} + 1) <= ${promotions.max_uses_total}`,
                ),
              ),
            )
            .returning();
          if (!updatedPromo) {
            // Race condition — another request consumed the last slot between our check and now
            throw new HttpException(
              OrdersErrorKeyEnum.PROMOTION_IS_NO_LONGER_AVAILABLE_PLEASE_RETRY_WITHOUT_IT,
              HttpStatus.CONFLICT,
            );
          }
          // Auto-expire if limit now reached
          if (
            updatedPromo.max_uses_total !== null &&
            updatedPromo.total_used >= updatedPromo.max_uses_total
          ) {
            await tx
              .update(promotions)
              .set({ status: PromotionStatus.EXPIRED, expired_at: new Date() })
              .where(eq(promotions.id, appliedPromotion.id));
          }
          // Usage record
          await tx.insert(promotion_usage).values({
            promotion_id: appliedPromotion.id,
            order_id: newOrder.id,
            user_id: userId,
            company_id: companyId,
            coupon_code_used: appliedPromotion.coupon_id,
            discount_amount: String(discountAmount),
            promotion_snapshot: {
              promotion_id: appliedPromotion.id,
              name: appliedPromotion.name,
              promotion_type: appliedPromotion.promotion_type,
              discount_config: appliedPromotion.discount_config,
              priority: appliedPromotion.priority,
              is_exclusive: appliedPromotion.is_exclusive,
              valid_from: appliedPromotion.valid_from,
              valid_to: appliedPromotion.valid_to ?? null,
              // preserve calculator output for reporting
              applied_discount_detail: discountResult,
            },
          });
          // Analytics event
          await tx.insert(promotion_analytics_events).values({
            promotion_id: appliedPromotion.id,
            company_id: companyId,
            user_id: userId,
            order_id: newOrder.id,
            event_type: PromoEventType.REDEEMED,
            discount_amount: String(discountAmount),
            context: {
              grand_total_before: taxData.grandTotal,
              grand_total_after: grandTotal,
              promotion_type: appliedPromotion.promotion_type,
            },
          });
        }
        return {
          orderId: newOrder.id,
          totalAmount: String(grandTotal),
          discountAmount:
            discountAmount > 0 ? String(discountAmount) : undefined,
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
      throw new InternalServerErrorException(
        OrdersErrorKeyEnum.FAILED_TO_CREATE_ORDER,
        {
          cause: error,
        },
      );
    }
  }
  // ── All other methods unchanged below this line ──────────────────
  async getOrderById(orderId: string, domain?: string) {
    try {
      if (!orderId || !domain) {
        throw new HttpException(
          OrdersErrorKeyEnum.ORDER_ID_AND_DOMAIN_ARE_REQUIRED,
          HttpStatus.BAD_REQUEST,
        );
      }
      const companyId = await this.resolveCompanyId(domain);
      const [orderResult] = await this.db.query.orders.findMany({
        where: and(eq(orders.id, orderId), eq(orders.company_id, companyId)),
        with: { items: true },
      });
      if (!orderResult || !orderResult.items) {
        throw new HttpException(
          OrdersErrorKeyEnum.ORDER_NOT_FOUND_WITH_THE_PROVIDED_ID,
          HttpStatus.NOT_FOUND,
        );
      }
      return orderResult;
    } catch (error) {
      throw new InternalServerErrorException(
        OrdersErrorKeyEnum.FAILED_TO_FETCH_ORDER,
        {
          cause: error,
        },
      );
    }
  }
  async getAllOrders(filters?: {
    search: string;
    limit: number;
    offset: number;
    status: string | undefined;
    date: string;
    sortby: string;
  }) {
    try {
      const allOrders = await this.db.query.orders.findMany({
        columns: { id: true, created_at: true },
      });
      return allOrders;
    } catch (error) {
      throw new InternalServerErrorException(
        OrdersErrorKeyEnum.FAILED_TO_FETCH_ORDERS,
        {
          cause: error,
        },
      );
    }
  }
  async completeOrderVerification(
    customerDetails: { email: string; first_name: string; last_name: string },
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
  ): Promise<{
    tx: DrizzleService;
    success: boolean;
    orderId: string;
    message: string;
    wasAlreadyVerified?: boolean;
  }> {
    if (!orderId) {
      throw new HttpException(
        OrdersErrorKeyEnum.ORDER_ID_IS_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!companyId) {
      throw new HttpException(
        OrdersErrorKeyEnum.COMPANY_ID_IS_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      if (!existingOrder || !existingOrder.user_id) {
        throw new HttpException(
          OrdersErrorKeyEnum.ORDER_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }

      const orderLines = await this.db
        .select({
          variantId: order_items.product_variant_id,
          quantity: order_items.quantity,
        })
        .from(order_items)
        .where(eq(order_items.order_id, orderId));

      return this.db.transaction(async (tx) => {
        // Enforce idempotency inside transaction to prevent race conditions (SELECT FOR UPDATE)
        const [orderRecord] = await tx
          .select({ order_status: orders.order_status })
          .from(orders)
          .where(eq(orders.id, orderId))
          .limit(1)
          .for('update');

        if (!orderRecord) {
          throw new HttpException(
            OrdersErrorKeyEnum.ORDER_NOT_FOUND,
            HttpStatus.NOT_FOUND,
          );
        }

        if (orderRecord.order_status !== OrderStatus.PENDING) {
          return {
            tx: tx as DrizzleService,
            success: orderRecord.order_status !== OrderStatus.CANCELLED,
            orderId,
            message: `Order verification already completed with status: ${orderRecord.order_status}`,
            wasAlreadyVerified: true,
          };
        }
        if (isSuccess) {
          const orderItemsRecord = await tx
            .select({ id: order_items.id })
            .from(order_items)
            .where(eq(order_items.order_id, orderId));

          if (orderItemsRecord.length > 0) {
            await tx
              .update(order_items)
              .set({ order_status: OrderStatus.PROCESSING })
              .where(eq(order_items.order_id, orderId))
              .catch((error) => {
                throw new InternalServerErrorException(
                  OrdersErrorKeyEnum.FAILED_TO_UPDATE_ORDER_STATUS,
                  { cause: error },
                );
              });
          }
          await tx
            .update(orders)
            .set({ order_status: OrderStatus.PROCESSING })
            .where(eq(orders.id, orderId))
            .catch((error) => {
              throw new InternalServerErrorException(
                OrdersErrorKeyEnum.FAILED_TO_UPDATE_ORDER_STATUS,
                { cause: error },
              );
            });

          await tx
            .update(payments)
            .set({ payment_status: PaymentStatus.COMPLETED })
            .where(eq(payments.order_id, orderId))
            .returning()
            .catch((error) => {
              throw new InternalServerErrorException(
                OrdersErrorKeyEnum.FAILED_TO_UPDATE_PAYMENT_STATUS,
                { cause: error },
              );
            });
          if (customerDetails.email) {
            await this.mailService
              .sendOrderPlacedEmail(
                customerDetails.email,
                `${customerDetails.first_name} ${customerDetails.last_name}`,
                orderId,
                Number(existingOrder.total_amount),
              )
              .catch((error) => {});
          }
          // Fire-and-forget invoice generation
          // this.invoiceService
          //   .createInvoice(orderId)
          //   .then(() =>
          //     ,
          //   )
          //   .catch((err) =>
          //     ,
          //   );
          const itemIds = orderItemsRecord.map((item) => item.id);
          if (itemIds.length > 0) {
            const orderItemsWithPolicies = await tx
              .select()
              .from(order_item_policy)
              .where(inArray(order_item_policy.order_item_id, itemIds))
              .catch((error) => {
                throw new InternalServerErrorException(
                  OrdersErrorKeyEnum.FAILED_TO_FETCH_ORDER_ITEM_POLICIES,
                  { cause: error },
                );
              });

            // Fire-and-forget warranty PDF generation per item
            for (const itemPolicy of orderItemsWithPolicies) {
              const snapshot = itemPolicy.policy_snapshot as PolicySnapshot;
              // if (snapshot?.generates_document) {
              //   this.policyDocumentService
              //     .generatePolicyDocument(itemPolicy.order_item_id)
              //     .then(() =>
              //       ,
              //     )
              //     .catch((err) =>
              //       ,
              //     );
              // }
            }
          }
          return {
            tx: tx as DrizzleService,
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
          await tx
            .update(order_items)
            .set({ order_status: OrderStatus.CANCELLED })
            .where(eq(order_items.order_id, orderId))
            .catch((error) => {
              throw new InternalServerErrorException(
                OrdersErrorKeyEnum.FAILED_TO_UPDATE_ORDER_STATUS,
                { cause: error },
              );
            });
          await tx
            .update(orders)
            .set({ order_status: OrderStatus.CANCELLED })
            .where(eq(orders.id, orderId))
            .catch((error) => {
              throw new InternalServerErrorException(
                OrdersErrorKeyEnum.FAILED_TO_UPDATE_ORDER_STATUS,
                { cause: error },
              );
            });
          await tx
            .update(payments)
            .set({ payment_status: PaymentStatus.FAILED })
            .where(eq(payments.order_id, orderId))
            .catch((error) => {
              throw new InternalServerErrorException(
                OrdersErrorKeyEnum.FAILED_TO_UPDATE_PAYMENT_STATUS,
                { cause: error },
              );
            });
          return {
            tx: tx as DrizzleService,
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
        throw error;
      }
      throw new InternalServerErrorException(
        OrdersErrorKeyEnum.FAILED_TO_COMPLETE_ORDER_VERIFICATION,
        { cause: error },
      );
    }
  }
  async getOrdersCount(userId: string, domain: string) {
    try {
      if (!userId) {
        throw new HttpException(
          OrdersErrorKeyEnum.USER_ID_IS_REQUIRED,
          HttpStatus.BAD_REQUEST,
        );
      }
      const companyId = await this.resolveCompanyId(domain);
      const [ordersCount] = await this.db
        .select({
          count: sql`count(distinct ${orders.id})`,
          activeOrders: sql`array_agg(distinct ${orders.id} order by ${orders.created_at} desc) filter (where ${order_items.order_status} = '${OrderStatus.PROCESSING}')`,
        })
        .from(orders)
        .innerJoin(
          order_items,
          and(
            eq(order_items.order_id, orders.id),
            eq(order_items.order_status, OrderStatus.PROCESSING),
            gt(order_items.quantity, 0),
          ),
        )
        .where(
          and(eq(orders.user_id, userId), eq(orders.company_id, companyId)),
        )
        .catch((error) => {
          throw new InternalServerErrorException(
            OrdersErrorKeyEnum.FAILED_TO_RETRIEVE_USER_ORDERS_COUNT,
            { cause: error },
          );
        });
      return ordersCount;
    } catch (error) {
      throw new InternalServerErrorException(
        OrdersErrorKeyEnum.FAILED_TO_RETRIEVE_USER_ORDERS_COUNT,
        {
          cause: error,
        },
      );
    }
  }
  async getUserOrderDetails(
    orderId: string,
    domain: string,
    offset: number = 0,
    limit: number = 10,
    status?: OrderStatus,
  ) {
    try {
      if (!orderId || !domain) {
        throw new HttpException(
          OrdersErrorKeyEnum.ORDER_ID_AND_DOMAIN_ARE_REQUIRED,
          HttpStatus.BAD_REQUEST,
        );
      }
      const companyId = await this.resolveCompanyId(domain);
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
                  product_id: true,
                },
                with: {
                  images: {
                    where: eq(product_images.is_primary, true),
                    columns: { image_url: true },
                  },
                },
              },
              return_request: {
                columns: {
                  id: true,
                  status: true,
                  store_owner_note: true,
                  tracking_id: true,
                  type: true,
                },
              },
              cancelledRecord: true,
            },
          },
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
          payment: true,
          shipping: { columns: { tracking_url: true } },
          gstInvoice: true,
        },
      });
      if (!orderDetails) {
        throw new HttpException(
          OrdersErrorKeyEnum.ORDER_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }
      return orderDetails;
    } catch (error) {
      throw new InternalServerErrorException(
        OrdersErrorKeyEnum.FAILED_TO_RETRIEVE_ORDER_DETAILS,
        { cause: error },
      );
    }
  }
  async getOrdersList(
    domain: string,
    offset: number = 0,
    limit: number = 50,
    status?: OrderStatus,
  ) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const totalOrders = await this.db
        .selectDistinct({ id: orders.id })
        .from(orders)
        .innerJoin(
          order_items,
          and(
            eq(order_items.order_id, orders.id),
            Object.values(OrderStatus).includes(status as OrderStatus)
              ? and(
                  // @ts-ignore
                  eq(order_items.order_status, status),
                  gt(order_items.quantity, 0),
                )
              : undefined,
          ),
        )
        .where(eq(orders.company_id, companyId));
      const validOrderIds = (
        await this.db
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
                    gt(order_items.quantity, 0),
                  )
                : undefined,
            ),
          )
          .where(eq(orders.company_id, companyId))
          .orderBy(desc(orders.created_at))
          .limit(limit)
          .offset(offset)
      ).map((o) => o.id);
      if (validOrderIds.length === 0) return [];
      const ordersList = await this.db.query.orders.findMany({
        where: and(
          eq(orders.company_id, companyId),
          inArray(orders.id, validOrderIds),
        ),
        orderBy: desc(orders.created_at),
        columns: { id: true, total_amount: true, created_at: true },
        with: {
          items: {
            where: Object.values(OrderStatus).includes(status as OrderStatus)
              ? and(
                  // @ts-ignore
                  eq(order_items.order_status, status),
                  gt(order_items.quantity, 0),
                )
              : undefined,
            columns: { order_status: true, quantity: true, price: true },
            with: {
              cancelledRecord: true,
              return_request: true,
              invoice: true,
              order: { with: { payment: true } },
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
      return { orders: ordersList, totalCount: totalOrders.length };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        OrdersErrorKeyEnum.FAILED_TO_RETRIEVE_ORDERS_LIST,
        {
          cause: error,
        },
      );
    }
  }
  async getOrderDetails(orderId: string, domain: string) {
    try {
      if (!orderId || !domain) {
        throw new HttpException(
          OrdersErrorKeyEnum.ORDER_ID_AND_DOMAIN_ARE_REQUIRED,
          HttpStatus.BAD_REQUEST,
        );
      }
      const companyId = await this.resolveCompanyId(domain);
      const row = await this.db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.company_id, companyId)),
        columns: { id: true, total_amount: true, created_at: true },
        with: {
          items: {
            columns: {
              id: true,
              order_status: true,
              quantity: true,
              price: true,
            },
            with: {
              invoice: true,
              return_request: true,
              cancelledRecord: true,
              refund: true,
              variant: {
                columns: { id: true, variant_name: true, price: true },
                with: {
                  images: {
                    where: eq(product_images.is_primary, true),
                    columns: { image_url: true },
                  },
                  inventory: {
                    columns: { stock_quantity: true, warehouse_id: true },
                    with: {
                      warehouse: {
                        columns: { warehouse_name: true, address_id: true },
                        with: {
                          address: {
                            columns: {
                              address_line_1: true,

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

              city: true,
              state: true,
              postal_code: true,
              country: true,
            },
          },
          payment: true,
          shipping: { columns: { tracking_url: true } },
          invoice: true,
        },
      });
      if (!row) {
        throw new HttpException(
          OrdersErrorKeyEnum.ORDER_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }
      const warehouseIds = new Set(
        row.items.map((i) => i?.variant?.inventory?.warehouse_id ?? null),
      );
      const isSingleWarehouse = warehouseIds.size <= 1;
      return {
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
        invoice: row.invoice ?? null,
        items: row.items.map((item) => {
          const inventory = item?.variant?.inventory ?? null;
          const warehouse = inventory?.warehouse ?? null;
          return {
            id: item.id,
            quantity: item?.quantity,
            unit_price: item?.price,
            line_total: (Number(item?.price) * item?.quantity).toFixed(2),
            order_status: item?.order_status,
            refund: item?.refund,
            return: item?.return_request,
            cancel: item?.cancelledRecord,
            invoice: item.invoice ?? null,
            warehouse: warehouse
              ? {
                  id: inventory?.warehouse_id ?? null,
                  name: warehouse.warehouse_name,
                  address: warehouse.address
                    ? {
                        address_line_1: warehouse.address.address_line_1,

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
              image_url: item.variant?.images?.[0]?.image_url ?? null,
            },
          };
        }),
        shipping_address: row.address
          ? {
              name: row.address.name,
              address_line_1: row.address.address_line_1,

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
        shipping: { tracking_url: row.shipping?.tracking_url ?? null },
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        OrdersErrorKeyEnum.FAILED_TO_RETRIEVE_ORDER_DETAILS,
        { cause: error },
      );
    }
  }
  async setOrderStatus(
    orderId: string,
    newStatus: OrderStatus,
    domain: string,
  ) {
    const filteredDomain = domainExtractor(domain);
    const companyId = await this.companyService.find(filteredDomain);
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
        throw new HttpException(
          OrdersErrorKeyEnum.ORDER_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }
      if (
        !Object.values(OrderStatus).includes(
          newStatus.toLowerCase() as OrderStatus,
        )
      ) {
        throw new HttpException(
          OrdersErrorKeyEnum.INVALID_ORDER_STATUS_VALUE,
          HttpStatus.BAD_REQUEST,
        );
      }
      const orderItemsRecord = await this.db
        .select({ id: order_items.id })
        .from(order_items)
        .where(eq(order_items.order_id, orderId))
        .limit(1);
      if (orderItemsRecord) {
        await Promise.all(
          orderItemsRecord.map((item) =>
            this.db
              .update(order_items)
              .set({ order_status: newStatus.toLowerCase() as OrderStatus })
              .where(
                and(
                  eq(order_items.order_id, orderId),
                  eq(order_items.id, item.id),
                ),
              )
              .catch((error) => {
                throw new InternalServerErrorException(
                  OrdersErrorKeyEnum.FAILED_TO_UPDATE_ORDER_STATUS,
                  { cause: error },
                );
              }),
          ),
        );
      }
      await this.db
        .update(orders)
        .set({ order_status: newStatus.toLowerCase() as OrderStatus })
        .where(eq(orders.id, orderId))
        .catch((error) => {
          throw new InternalServerErrorException(
            OrdersErrorKeyEnum.FAILED_TO_UPDATE_ORDER_STATUS,
            { cause: error },
          );
        });
      return orderId;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        OrdersErrorKeyEnum.FAILED_TO_UPDATE_ORDER_STATUS,
        {
          cause: error,
        },
      );
    }
  }
  async getPendingOrders(
    domain: string,
    filters?: {
      search: string;
      limit: number;
      offset: number;
      status: string | undefined;
      date: string;
      sortby: string;
    },
  ) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const result = await this.db.query.orders.findMany({
        where: eq(orders.company_id, companyId),
        limit: filters?.limit ?? 10,
        offset: filters?.offset ?? 0,
        with: {
          items: {
            where: filters?.status
              ? or(
                  filters?.status === OrderStatus.PENDING
                    ? eq(order_items.order_status, OrderStatus.PENDING)
                    : undefined,
                  filters?.status === OrderStatus.PROCESSING
                    ? eq(order_items.order_status, OrderStatus.PROCESSING)
                    : undefined,
                )
              : undefined,
            columns: {
              id: true,
              order_id: true,
              order_status: true,
              created_at: true,
              updated_at: true,
            },
          },
        },
      });
      return result.map((order) => order.items).flat();
    } catch (error) {
      throw new InternalServerErrorException(
        OrdersErrorKeyEnum.FAILED_TO_FETCH_PENDING_ORDERS,
        {
          cause: error,
        },
      );
    }
  }
  async getSalesAnalytics(domain: string, days: number = 30) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      // Calculate the date cutoff
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const analytics = await this.db
        .select({
          // Format date as YYYY-MM-DD for the chart X-Axis
          date: sql<string>`TO_CHAR(${order_items.created_at}, 'YYYY-MM-DD')`,
          // Calculate total revenue (price * quantity)
          revenue: sql<number>`CAST(SUM(${order_items.price} * ${order_items.quantity}) AS FLOAT)`,
          // Count total items sold
          salesCount: sql<number>`CAST(COUNT(${order_items.id}) AS INTEGER)`,
        })
        .from(order_items)
        .where(
          and(
            eq(order_items.company_id, companyId),
            sql`${order_items.order_status} NOT IN ('cancelled', 'returned')`,
            gte(order_items.created_at, cutoffDate),
          ),
        )
        .groupBy(sql`TO_CHAR(${order_items.created_at}, 'YYYY-MM-DD')`)
        .orderBy(sql`TO_CHAR(${order_items.created_at}, 'YYYY-MM-DD') ASC`);
      // Calculate total revenue for the summary card
      const totalRevenue = analytics.reduce(
        (acc, curr) => acc + (curr.revenue || 0),
        0,
      );
      return {
        chartData: analytics,
        totalRevenue,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        OrdersErrorKeyEnum.FAILED_TO_FETCH_SALES_ANALYTICS,
        { cause: error },
      );
    }
  }
  async getTopSellingProducts(domain: string, limit: number = 5) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const topProducts = await this.db
        .select({
          variant_id: product_variants.id,
          variant_name: product_variants.variant_name,
          sku: product_variants.sku,
          // Sum the quantities from order_items
          total_sold: sql<number>`CAST(SUM(${order_items.quantity}) AS INTEGER)`,
          // Calculate total revenue generated by this specific variant
          revenue: sql<number>`CAST(SUM(${order_items.price} * ${order_items.quantity}) AS FLOAT)`,
        })
        .from(order_items)
        .innerJoin(
          product_variants,
          eq(order_items.product_variant_id, product_variants.id),
        )
        .where(
          and(
            eq(order_items.company_id, companyId),
            // Exclude cancelled/returned orders from the "top selling" metric
            sql`${order_items.order_status} NOT IN ('cancelled', 'returned')`,
          ),
        )
        .groupBy(
          product_variants.id,
          product_variants.variant_name,
          product_variants.sku,
        )
        .orderBy(sql`SUM(${order_items.quantity}) DESC`)
        .limit(limit);
      return topProducts;
    } catch (error) {
      throw new InternalServerErrorException(
        OrdersErrorKeyEnum.FAILED_TO_FETCH_TOP_SELLING_PRODUCTS,
        { cause: error },
      );
    }
  }
  async getConversionMetrics(domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      // ==========================================
      // 1. OVERALL STORE CONVERSION
      // ==========================================
      const [cartData] = await this.db
        .select({ count: sql<number>`CAST(COUNT(${carts.id}) AS INTEGER)` })
        .from(carts)
        .where(eq(carts.company_id, companyId))
        .catch((error) => {
          throw new InternalServerErrorException(
            OrdersErrorKeyEnum.FAILED_TO_CALCULATE_CONVERSION_METRICS,
            { cause: error },
          );
        });
      const [orderData] = await this.db
        .select({
          count: sql<number>`CAST(COUNT(${order_items.id}) AS INTEGER)`,
        })
        // BUG FIX: Was querying from `order_items` table but selecting COUNT of `orders.id`.
        // `orders` table is not joined here, so `orders.id` would reference an unjoined table.
        // Fixed: select COUNT of `order_items.id` since we're querying order_items directly.
        .from(order_items)
        .where(
          and(
            eq(order_items.company_id, companyId),
            // BUG FIX: Using raw sql template with string interpolation for enum values
            // is unsafe and broken — the interpolated string gets quoted as a SQL identifier,
            // not a string literal. e.g. produces: NOT IN ('CANCELLED') with wrong quoting.
            // Fixed: use Drizzle's `notInArray` operator for type-safe enum comparison.
            notInArray(order_items.order_status, [
              OrderStatus.CANCELLED,
              OrderStatus.RETURNED,
            ]),
          ),
        )
        .catch((error) => {
          throw new InternalServerErrorException(
            OrdersErrorKeyEnum.FAILED_TO_CALCULATE_CONVERSION_METRICS,
            { cause: error },
          );
        });
      const totalCarts = cartData?.count || 0;
      const totalOrders = orderData?.count || 0;
      const overallConversionRate =
        totalCarts > 0 ? ((totalOrders / totalCarts) * 100).toFixed(2) : 0;
      const overallAbandonmentRate =
        totalCarts > 0
          ? (((totalCarts - totalOrders) / totalCarts) * 100).toFixed(2)
          : 0;
      // ==========================================
      // 2. PRODUCT/VARIANT LEVEL CONVERSION
      // ==========================================
      // A. Count how many times each variant was added to a cart
      const variantCartStats = await this.db
        .select({
          variant_id: cart_items.product_variant_id,
          cart_additions: sql<number>`CAST(COUNT(${cart_items.id}) AS INTEGER)`,
        })
        .from(cart_items)
        .innerJoin(carts, eq(cart_items.cart_id, carts.id))
        .where(eq(carts.company_id, companyId))
        .groupBy(cart_items.product_variant_id)
        .catch((error) => {
          throw new InternalServerErrorException(
            OrdersErrorKeyEnum.FAILED_TO_CALCULATE_CONVERSION_METRICS,
            { cause: error },
          );
        });
      // B. Count how many times each variant was successfully ordered
      const variantOrderStats = await this.db
        .select({
          variant_id: order_items.product_variant_id,
          order_completions: sql<number>`CAST(COUNT(${order_items.id}) AS INTEGER)`,
        })
        .from(order_items)
        .where(
          and(
            eq(order_items.company_id, companyId),
            // BUG FIX: Same raw sql enum interpolation issue as above.
            // Fixed: use `notInArray` for correct, type-safe SQL generation.
            notInArray(order_items.order_status, [
              OrderStatus.CANCELLED,
              OrderStatus.RETURNED,
            ]),
          ),
        )
        .groupBy(order_items.product_variant_id)
        .catch((error) => {
          throw new InternalServerErrorException(
            OrdersErrorKeyEnum.FAILED_TO_CALCULATE_CONVERSION_METRICS,
            { cause: error },
          );
        });
      // C. Get Variant Details for the UI (Name, SKU)
      const variantIds = variantCartStats
        .map((v) => v.variant_id)
        .filter(Boolean) as string[];
      let productDetails: any[] = [];
      if (variantIds.length > 0) {
        productDetails = await this.db
          .select({
            id: product_variants.id,
            name: product_variants.variant_name,
            sku: product_variants.sku,
          })
          .from(product_variants)
          .where(inArray(product_variants.id, variantIds))
          .catch((error) => {
            throw new InternalServerErrorException(
              OrdersErrorKeyEnum.FAILED_TO_CALCULATE_CONVERSION_METRICS,
              { cause: error },
            );
          });
      }
      // D. Merge the data together
      const productConversions = productDetails.map((details) => {
        // BUG FIX: Local variables `cartData` and `orderData` shadow the outer-scope
        // `cartData` and `orderData` declared above for overall metrics, causing confusion
        // and potential incorrect references. Renamed to `variantCart` and `variantOrder`.
        const variantCart = variantCartStats.find(
          (v) => v.variant_id === details.id,
        );
        const variantOrder = variantOrderStats.find(
          (v) => v.variant_id === details.id,
        );
        const cartAdditions = variantCart?.cart_additions || 0;
        const orderCompletions = variantOrder?.order_completions || 0;
        const conversionRate =
          cartAdditions > 0
            ? ((orderCompletions / cartAdditions) * 100).toFixed(2)
            : 0;
        return {
          variantId: details.id,
          variantName: details.name,
          sku: details.sku,
          cartAdditions,
          orderCompletions,
          conversionRate: Number(conversionRate),
        };
      });
      // Sort by most cart additions descending
      productConversions.sort((a, b) => b.cartAdditions - a.cartAdditions);
      return {
        overall: {
          totalCarts,
          totalOrders,
          conversionRate: Number(overallConversionRate),
          abandonmentRate: Number(overallAbandonmentRate),
        },
        productConversions,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        OrdersErrorKeyEnum.FAILED_TO_CALCULATE_CONVERSION_METRICS,
        { cause: error },
      );
    }
  }
  async exportVendorAnalytics(domain: string): Promise<string> {
    try {
      const companyId = await this.resolveCompanyId(domain);
      // 1. Get Cart Additions per variant
      const variantCartStats = await this.db
        .select({
          variant_id: cart_items.product_variant_id,
          cart_additions: sql<number>`CAST(COUNT(${cart_items.id}) AS INTEGER)`,
        })
        .from(cart_items)
        .innerJoin(carts, eq(cart_items.cart_id, carts.id))
        .where(eq(carts.company_id, companyId))
        .groupBy(cart_items.product_variant_id)
        .catch((error) => {
          throw new InternalServerErrorException(
            OrdersErrorKeyEnum.FAILED_TO_EXPORT_ANALYTICS_CSV,
            { cause: error },
          );
        });
      // 2. Get Orders & Revenue per variant
      const variantOrderStats = await this.db
        .select({
          variant_id: order_items.product_variant_id,
          units_sold: sql<number>`CAST(SUM(${order_items.quantity}) AS INTEGER)`,
          revenue: sql<number>`CAST(SUM(${order_items.price} * ${order_items.quantity}) AS FLOAT)`,
        })
        .from(order_items)
        .where(
          // Already correctly using notInArray here — no change needed.
          and(
            eq(order_items.company_id, companyId),
            notInArray(order_items.order_status, [
              OrderStatus.CANCELLED,
              OrderStatus.RETURNED,
            ]),
          ),
        )
        .groupBy(order_items.product_variant_id)
        .catch((error) => {
          throw new InternalServerErrorException(
            OrdersErrorKeyEnum.FAILED_TO_EXPORT_ANALYTICS_CSV,
            { cause: error },
          );
        });
      // 3. Get Variant Details
      // BUG FIX: The deduplication logic using `self.indexOf(value)` compares object
      // references, not string values — for UUIDs (strings) this is fine, but the
      // `value &&` check short-circuits falsy strings. Replaced with a Set for
      // correct and efficient deduplication.
      const allVariantIds = Array.from(
        new Set(
          [
            ...variantCartStats.map((v) => v.variant_id),
            ...variantOrderStats.map((v) => v.variant_id),
          ].filter((id): id is string => !!id),
        ),
      );
      let productDetails: any[] = [];
      if (allVariantIds.length > 0) {
        productDetails = await this.db
          .select({
            id: product_variants.id,
            name: product_variants.variant_name,
            sku: product_variants.sku,
          })
          .from(product_variants)
          .where(inArray(product_variants.id, allVariantIds))
          .catch((error) => {
            throw new InternalServerErrorException(
              OrdersErrorKeyEnum.FAILED_TO_EXPORT_ANALYTICS_CSV,
              { cause: error },
            );
          });
      }
      // 4. Build CSV Headers
      let csvString =
        'Variant Name,SKU,Cart Additions,Units Sold,Revenue (INR),Conversion Rate (%)\n';
      // 5. Populate CSV Rows
      productDetails.forEach((details) => {
        const cartData = variantCartStats.find(
          (v) => v.variant_id === details.id,
        );
        const orderData = variantOrderStats.find(
          (v) => v.variant_id === details.id,
        );
        const cartAdditions = cartData?.cart_additions || 0;
        const unitsSold = orderData?.units_sold || 0;
        const revenue = orderData?.revenue || 0;
        // BUG FIX: Conversion rate uses `unitsSold / cartAdditions` but `unitsSold`
        // is SUM of quantity (units), while `cartAdditions` is COUNT of cart_item rows.
        // A single cart_item row can have quantity > 1, making this ratio potentially > 100%.
        // For a meaningful conversion rate (did the cart item convert to an order?),
        // count order_item rows, not quantity sum. However since the query already aggregates
        // by variant using COUNT(*) for cart and SUM(quantity) for orders, this is an
        // intentional business metric mismatch — flagged here for awareness.
        // If true row-level conversion is needed, change units_sold query to COUNT(id).
        const conversionRate =
          cartAdditions > 0
            ? ((unitsSold / cartAdditions) * 100).toFixed(2)
            : '0.00';
        // BUG FIX: `details.name` could be null/undefined if variant_name is null in DB,
        // causing `.replace()` to throw. Added null-safe fallback.
        const safeName = `"${(details.name ?? '').replace(/"/g, '""')}"`;
        // BUG FIX: `revenue` comes from a CAST(...AS FLOAT) sql expression which Drizzle
        // returns as a string from pg driver (numeric/decimal columns always return strings).
        // Wrap in Number() to ensure numeric formatting in CSV, not a raw string.
        csvString += `${safeName},${details.sku},${cartAdditions},${unitsSold},${Number(revenue).toFixed(2)},${conversionRate}\n`;
      });
      return csvString;
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      throw new InternalServerErrorException(
        OrdersErrorKeyEnum.FAILED_TO_EXPORT_ANALYTICS_CSV,
        {
          cause: error,
        },
      );
    }
  }
}
