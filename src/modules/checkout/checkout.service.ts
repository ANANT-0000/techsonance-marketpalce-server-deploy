import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
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
  promotion_analytics_events,
  promotion_usage,
  promotions,
} from '../../drizzle/schema/promotions.schema';
import { PromoEventType, PromotionStatus } from '../../drizzle/types/types';
import { CheckoutErrorKeyEnum } from './constants/checkout.enums';

@Injectable()
export class CheckoutService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly ordersService: OrdersService,
    private readonly companyService: CompanyService,
    private readonly mailService: MailService,
  ) {}

  private async resolveCompanyId(domain: string): Promise<string> {
    const filteredDomain = domainExtractor(domain);
    return this.companyService.find(filteredDomain);
  }
  async initiateCheckout(
    userId: string,
    initiateCheckoutDto: InitiateCheckoutDto,
    domain: string,
  ) {
    const { addressId, paymentMethod, cartId, productVariantId } =
      initiateCheckoutDto;
    if (!cartId && !productVariantId) {
      throw new HttpException(
        CheckoutErrorKeyEnum.EITHER_CARTID_OR_PRODUCTVARIANTID_MUST_BE_PROVIDED,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!domain) {
      throw new HttpException(
        CheckoutErrorKeyEnum.COMPANY_DOMAIN_MUST_BE_PROVIDED_IN_HEADERS,
        HttpStatus.BAD_REQUEST,
      );
    }
    const companyId = await this.resolveCompanyId(domain);

    const addressRecord = await this.db
      .select()
      .from(address)
      .where(eq(address.user_id, userId))
      .limit(1)
      .catch((error) => {
        throw new HttpException(
          CheckoutErrorKeyEnum.FAILED_TO_FETCH_ADDRESS_FOR_CHECKOUT,
          HttpStatus.INTERNAL_SERVER_ERROR,
          { cause: error },
        );
      });
    if (!addressRecord) {
      throw new HttpException(CheckoutErrorKeyEnum.ADDRESS_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    const orderLines = await this._resolveOrderLines(
      userId,
      cartId,
      productVariantId,
      initiateCheckoutDto.qty,
    );
    if (!orderLines || orderLines.length === 0) {
      throw new HttpException(
        CheckoutErrorKeyEnum.NO_VALID_ORDER_LINES_FOUND_FOR_CHECKOUT,
        HttpStatus.BAD_REQUEST,
      );
    }
    return await this.ordersService.createOrder({
      userId,
      companyId,
      addressId,
      orderLines,
      paymentMethod,
      promotion_id: initiateCheckoutDto.promotionId ?? undefined,
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

    const companyId = await this.resolveCompanyId(domain);
    if (!companyId) {
      throw new HttpException(CheckoutErrorKeyEnum.COMPANY_NOT_FOUND, HttpStatus.NOT_FOUND);
    }

    const [existingOrder] = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.company_id, companyId)))
      .limit(1);
    if (!existingOrder.user_id) {
      throw new HttpException(CheckoutErrorKeyEnum.USER_NOT_FOUND, HttpStatus.BAD_REQUEST);
    }
    try {
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
        throw new HttpException(CheckoutErrorKeyEnum.CUSTOMER_NOT_FOUND, HttpStatus.NOT_FOUND);
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
      if (verificationResult.success && !verificationResult.wasAlreadyVerified) {
        if (productVariantId) {
          await verificationResult.tx
            .delete(cart_items)
            .where(eq(cart_items.product_variant_id, productVariantId))
            .catch((error) => {
              throw new HttpException(
                CheckoutErrorKeyEnum.FAILED_TO_CLEAR_SINGLE_PRODUCT_VARIANT_CHECKOUT_RECORD_AFTER_SUCCESSFUL_CHECKOUT,
                HttpStatus.INTERNAL_SERVER_ERROR,
                { cause: error },
              );
            });
        }
        if (cartId) {
          await this._clearCart(verificationResult.tx, cartId, orderId);
        }
      }
      return {
        success: verificationResult.success,
        message: verificationResult.message,
        orderId: verificationResult.orderId,
      };
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error; // Re-throw known HTTP exceptions
      }
      throw new InternalServerErrorException(CheckoutErrorKeyEnum.FAILED_TO_VERIFY_CHECKOUT, {
        cause: error,
      });
    }
  }
  // private helpers
  private async _resolveOrderLines(
    userId: string,
    cartId?: string,
    productVariantId?: string,
    qty?: number,
  ): Promise<
    { variantId: string; price: number; quantity: number }[] | undefined
  > {
    if (productVariantId) {
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
          CheckoutErrorKeyEnum.PRODUCT_VARIANT_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }
      return [
        {
          variantId: variant.id,
          price: Number(variant.price),
          quantity: qty ?? 1,
        },
      ];
    }
    if (cartId) {
      const [cartRecord] = await this.db
        .select({ id: carts.id })
        .from(carts)
        .where(eq(carts.id, cartId))
        .limit(1);
      if (!cartRecord) {
        throw new HttpException(CheckoutErrorKeyEnum.CART_NOT_FOUND, HttpStatus.NOT_FOUND);
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
    await tx
      .delete(carts)
      .where(and(eq(carts.id, cartId), eq(carts.user_id, userId)))
      .catch((error) => {
        throw new HttpException(
          CheckoutErrorKeyEnum.FAILED_TO_CLEAR_CART_AFTER_SUCCESSFUL_CHECKOUT,
          HttpStatus.INTERNAL_SERVER_ERROR,
          { cause: error },
        );
      });
    await tx
      .delete(cart_items)
      .where(eq(cart_items.cart_id, cartId))
      .catch((error) => {
        throw new HttpException(
          CheckoutErrorKeyEnum.FAILED_TO_CLEAR_CART_ITEMS_AFTER_SUCCESSFUL_CHECKOUT,
          HttpStatus.INTERNAL_SERVER_ERROR,
          { cause: error },
        );
      });
  }
}
