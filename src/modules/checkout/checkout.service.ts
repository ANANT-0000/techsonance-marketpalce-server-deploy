import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { InitiateCheckoutDto, VerifyCheckoutDto } from './dto/checkout.dto';
import { type DrizzleDB } from '../../drizzle/types/drizzle';
import { DRIZZLE, DrizzleService } from '../../drizzle/drizzle.module';
import {
  address,
  cart_items,
  carts,
  company,
  coupon_usage,
  coupons,
  orders,
  product_variants,
  user,
} from '../../drizzle/schema';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { OrdersService } from '../orders/orders.service';
import { CompanyService } from '../company/company.service';
import { MailService } from '../../common/services/mail/mail.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import {
  promotion_usage,
  promotions,
} from 'src/drizzle/schema/promotions.schema';

@Injectable()
export class CheckoutService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly ordersService: OrdersService,
    private readonly companyService: CompanyService,
    private readonly mailService: MailService,
  ) {}

  private async resolveCompanyId(domain: string): Promise<string> {
    console.log(
      `[CheckoutService.resolveCompanyId] Resolving company for domain: ${domain}`,
    );
    const filteredDomain = domainExtractor(domain);
    console.log(
      `[CheckoutService.resolveCompanyId] Extracted filter domain: ${filteredDomain}`,
    );
    console.log(
      '[CheckoutService.resolveCompanyId] Querying CompanyService.find(...)',
    );
    return this.companyService.find(filteredDomain);
  }
  async initiateCheckout(
    userId: string,
    initiateCheckoutDto: InitiateCheckoutDto,
    domain: string,
  ) {
    const { addressId, paymentMethod, cartId, productVariantId } =
      initiateCheckoutDto;
    console.log('[CheckoutService.initiateCheckout] Request received', {
      userId,
      cartId,
      productVariantId,
      domain,
    });
    if (!cartId && !productVariantId) {
      throw new HttpException(
        'Either cartId or productVariantId must be provided',
        HttpStatus.BAD_REQUEST,
      );
    }
    console.log('[CheckoutService.initiateCheckout] Resolving company id');
    if (!domain) {
      throw new HttpException(
        'Company domain must be provided in headers',
        HttpStatus.BAD_REQUEST,
      );
    }
    const companyId = await this.resolveCompanyId(domain);
    console.log(
      `[CheckoutService.initiateCheckout] Company ID resolved: ${companyId}`,
    );

    console.log('[CheckoutService.initiateCheckout] Querying customer address');
    const addressRecord = await this.db
      .select()
      .from(address)
      .where(eq(address.user_id, userId))
      .limit(1)
      .catch((error) => {
        console.error('Error fetching address:', error);
        throw new HttpException(
          'Failed to fetch address for checkout',
          HttpStatus.INTERNAL_SERVER_ERROR,
          { cause: error },
        );
      });
    if (!addressRecord) {
      throw new HttpException('Address not found', HttpStatus.NOT_FOUND);
    }
    console.log('[CheckoutService.initiateCheckout] Resolving order lines');
    const orderLines = await this._resolveOrderLines(
      userId,
      cartId,
      productVariantId,
    );
    if (!orderLines || orderLines.length === 0) {
      throw new HttpException(
        'No valid order lines found for checkout',
        HttpStatus.BAD_REQUEST,
      );
    }
    console.log(
      '[CheckoutService.initiateCheckout] Creating order through OrdersService',
    );
    return await this.ordersService.createOrder({
      userId,
      companyId,
      addressId,
      orderLines,
      paymentMethod,
    });
  }

  async verifyCheckout(dto: VerifyCheckoutDto, domain: string) {
    const {
      discountApplied,
      promotionId,
      orderId,
      isSuccess,
      cartId,
      productVariantId,
    } = dto;
    console.log('[CheckoutService.verifyCheckout] Request received', {
      discountApplied,
      promotionId,
      orderId,
      isSuccess,
      cartId,
      productVariantId,
      domain,
    });

    console.log('[CheckoutService.verifyCheckout] Resolving company id');
    const companyId = await this.resolveCompanyId(domain);
    if (!companyId) {
      throw new HttpException('Company not found', HttpStatus.NOT_FOUND);
    }

    const [existingOrder] = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.company_id, companyId)))
      .limit(1);
    if (!existingOrder.user_id) {
      throw new HttpException('user not found', HttpStatus.BAD_REQUEST);
    }
    try {
      console.log('[CheckoutService.verifyCheckout] Querying customer record');
      const [customerRecord] = await this.db
        .select({
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
        })
        .from(user)
        .where(eq(user.id, existingOrder.user_id))
        .limit(1);
      if (
        !customerRecord ||
        (!customerRecord.first_name &&
          !customerRecord.last_name &&
          !customerRecord.email)
      ) {
        throw new HttpException('customer not found', HttpStatus.NOT_FOUND);
      }
      const customerDetails = {
        email: customerRecord.email,
        first_name: customerRecord.first_name || '',
        last_name: customerRecord.last_name || '',
      };
      const verificationResult =
        await this.ordersService.completeOrderVerification(
          customerDetails,
          existingOrder,
          orderId,
          isSuccess,
          companyId,
        );
      if (verificationResult.success) {
        console.log('[CheckoutService.verifyCheckout] Verification successful');
        if (promotionId && discountApplied) {
          console.log(
            '[CheckoutService.verifyCheckout] Recording promotion usage after successful checkout',
          );

          // 1. Atomic Update: Increment counter only if within limits
          const [updatedPromo] = await verificationResult.tx
            .update(promotions)
            .set({
              total_used: sql`${promotions.total_used} + 1`,
              // Auto-deactivate if max limit reached
              status: sql`CASE 
          WHEN ${promotions.max_uses_total} IS NOT NULL AND (${promotions.total_used} + 1) >= ${promotions.max_uses_total} 
          THEN 'EXPIRED' 
          ELSE ${promotions.status} 
        END`,
            })
            .where(
              and(
                eq(promotions.id, promotionId),
                // Ensure we don't exceed limits even with concurrent requests
                or(
                  isNull(promotions.max_uses_total),
                  sql`${promotions.total_used} < ${promotions.max_uses_total}`,
                ),
              ),
            )
            .returning();

          if (!updatedPromo) {
            throw new HttpException(
              'Promotion is no longer valid or usage limit reached',
              HttpStatus.BAD_REQUEST,
            );
          }

          // 2. Insert into Usage Log (The new source of truth)
          await verificationResult.tx.insert(promotion_usage).values({
            promotion_id: promotionId,
            company_id: companyId,
            order_id: orderId,
            user_id: existingOrder.user_id,
            discount_amount: discountApplied.toString(),
            promotion_snapshot: updatedPromo, // Save state for immutable history
          });
        }
        if (productVariantId) {
          console.log(
            '[CheckoutService.verifyCheckout] Clearing single product variant checkout record after successful checkout',
          );
          await verificationResult.tx
            .delete(cart_items)
            .where(eq(cart_items.product_variant_id, productVariantId))
            .catch((error) => {
              console.error(
                'Error clearing single product variant checkout record:',
                error,
              );
              throw new HttpException(
                'Failed to clear single product variant checkout record after successful checkout',
                HttpStatus.INTERNAL_SERVER_ERROR,
                { cause: error },
              );
            });
        }
        if (cartId) {
          console.log(
            '[CheckoutService.verifyCheckout] Clearing cart after checkout',
          );
          await this._clearCart(verificationResult.tx, cartId, orderId);
        }
      }
    } catch (error) {
      throw new HttpException(
        'Failed to verify checkout',
        HttpStatus.INTERNAL_SERVER_ERROR,
        {
          cause: error,
        },
      );
    }
  }
  // private helpers
  private async _resolveOrderLines(
    userId: string,
    cartId?: string,
    productVariantId?: string,
  ): Promise<
    { variantId: string; price: number; quantity: number }[] | undefined
  > {
    if (productVariantId) {
      console.log(
        '[CheckoutService._resolveOrderLines] Resolving single product variant checkout line',
      );
      const [variant] = await this.db
        .select({
          id: product_variants.id,
          price: product_variants.price,
        })
        .from(product_variants)
        .where(eq(product_variants.id, productVariantId))
        .limit(1);
      if (!variant) {
        throw new HttpException(
          'Product variant not found',
          HttpStatus.NOT_FOUND,
        );
      }
      return [
        {
          variantId: variant.id,
          price: Number(variant.price),
          quantity: 1,
        },
      ];
    }
    if (cartId) {
      console.log(
        '[CheckoutService._resolveOrderLines] Resolving cart checkout lines',
      );
      const [cartRecord] = await this.db
        .select({ id: carts.id })
        .from(carts)
        .where(eq(carts.id, cartId))
        .limit(1);
      if (!cartRecord) {
        throw new HttpException('Cart not found', HttpStatus.NOT_FOUND);
      }
      const cartItems = await this.db
        .select({
          variantId: cart_items.product_variant_id,
          price: product_variants.price,
          quantity: cart_items.quantity,
        })
        .from(cart_items)
        .innerJoin(
          product_variants,
          eq(cart_items.product_variant_id, product_variants.id),
        )
        .where(eq(cart_items.cart_id, cartRecord.id));
      return cartItems.map((item) => ({
        variantId: item.variantId ?? '',
        price: Number(item.price),
        quantity: item.quantity,
      }));
    }
  }

  private async _clearCart(tx: DrizzleService, cartId: string, userId: string) {
    console.log(
      '[CheckoutService._clearCart] Clearing cart after successful checkout',
      {
        cartId,
        userId,
      },
    );
    await tx
      .delete(carts)
      .where(and(eq(carts.id, cartId), eq(carts.user_id, userId)))
      .catch((error) => {
        console.error('Error clearing cart:', error);
        throw new HttpException(
          'Failed to clear cart after successful checkout',
          HttpStatus.INTERNAL_SERVER_ERROR,
          { cause: error },
        );
      });
    await tx
      .delete(cart_items)
      .where(eq(cart_items.cart_id, cartId))
      .catch((error) => {
        console.error('Error clearing cart items:', error);
        throw new HttpException(
          'Failed to clear cart items after successful checkout',
          HttpStatus.INTERNAL_SERVER_ERROR,
          { cause: error },
        );
      });
    console.log('[CheckoutService._clearCart] Cart cleared successfully');
  }
}
