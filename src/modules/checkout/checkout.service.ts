import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  inventory,
  warehouse,
} from '../../drizzle/schema';
import { and, eq, isNull, or, sql, inArray } from 'drizzle-orm';
import { OrdersService } from '../orders/orders.service';
import { CompanyService } from '../company/company.service';
import { MailService } from '../../common/services/mail/mail.service';
import { ShipRocketService } from '../ship-rocket/ship-rocket.service';
import { CryptoService } from '../shipping/crypto.service';
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
    private readonly shipRocketService: ShipRocketService,
    private readonly configService: ConfigService,
    private readonly cryptoService: CryptoService,
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
      .where(eq(address.id, addressId))
      .limit(1)
      .catch((error) => {
        throw new HttpException(
          CheckoutErrorKeyEnum.FAILED_TO_FETCH_ADDRESS_FOR_CHECKOUT,
          HttpStatus.INTERNAL_SERVER_ERROR,
          { cause: error },
        );
      });
    if (!addressRecord || addressRecord.length === 0) {
      throw new HttpException(CheckoutErrorKeyEnum.ADDRESS_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    const [resolvedAddress] = addressRecord;

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

    // Resolve logistics credentials strategy for dynamic serviceability check
    const [compRecord] = await this.db
      .select({
        logistics_mode: company.logistics_mode,
        encrypted_logistics_api_key: company.encrypted_logistics_api_key,
        encrypted_logistics_api_secret: company.encrypted_logistics_api_secret,
      })
      .from(company)
      .where(eq(company.id, companyId))
      .limit(1);

    let credentials: { email?: string; password?: string } | undefined;
    if (compRecord?.logistics_mode === 'STANDALONE') {
      if (
        compRecord.encrypted_logistics_api_key &&
        compRecord.encrypted_logistics_api_secret
      ) {
        const email = this.cryptoService.decrypt(compRecord.encrypted_logistics_api_key);
        const password = this.cryptoService.decrypt(compRecord.encrypted_logistics_api_secret);
        credentials = { email, password };
      }
    }

    // Resolve originating warehouse pincodes dynamically from variant stock levels
    const originPincodes = new Set<string>();
    const variantIds = orderLines.map((line) => line.variantId);

    const warehouseAddresses = await this.db
      .select({
        variantId: inventory.product_variant_id,
        postalCode: address.postal_code,
        stockQuantity: inventory.stock_quantity,
      })
      .from(inventory)
      .innerJoin(warehouse, eq(inventory.warehouse_id, warehouse.id))
      .innerJoin(address, eq(warehouse.address_id, address.id))
      .where(
        and(
          inArray(inventory.product_variant_id, variantIds),
          eq(inventory.company_id, companyId),
          sql`${inventory.stock_quantity} > 0`
        )
      );

    for (const line of orderLines) {
      const matches = warehouseAddresses.filter(
        (w) => w.variantId === line.variantId,
      );
      if (matches.length > 0) {
        // Pick the warehouse with the highest stock quantity for the variant
        matches.sort((a, b) => b.stockQuantity - a.stockQuantity);
        if (matches[0].postalCode) {
          originPincodes.add(matches[0].postalCode);
        }
      }
    }

    // Fallback to platform-default pickup pincode if no warehouse addresses could be resolved from inventory
    if (originPincodes.size === 0) {
      const fallbackPincode = this.configService.get<string>(
        'SHIPROCKET_PICKUP_PINCODE',
      );
      if (fallbackPincode) {
        originPincodes.add(fallbackPincode);
      }
    }

    // ── Pincode serviceability check ──────────────────────────────────────
    // Validate that at least one Shiprocket courier serves the delivery address
    // from each active origin warehouse pincode BEFORE finalizing order creation.
    if (originPincodes.size > 0 && resolvedAddress?.postal_code) {
      for (const originPincode of originPincodes) {
        try {
          const serviceabilityRes: any =
            await this.shipRocketService.getServiceability(
              {
                pickup_pincode: originPincode,
                delivery_pincode: resolvedAddress.postal_code,
                weight: 1,
                breadth: 10,
                height: 10,
                qc_check: 0,
                is_return: 0,
                mode: 'Surface',
                cod: initiateCheckoutDto.paymentMethod === 'COD' ? 1 : 0,
              },
              credentials,
              companyId,
            );

          const availableCouriers =
            serviceabilityRes?.data?.available_courier_companies ?? [];
          if (availableCouriers.length === 0) {
            throw new HttpException(
              `Delivery to pincode ${resolvedAddress.postal_code} is not currently serviceable from our warehouse location (${originPincode}). Please use a different delivery address.`,
              HttpStatus.UNPROCESSABLE_ENTITY,
            );
          }
        } catch (err: any) {
          // Only rethrow serviceability errors — network/API failures should
          // not block checkout (Shiprocket may be temporarily unavailable).
          if (err instanceof HttpException) throw err;
          console.warn(
            `[Checkout] Serviceability check skipped (Shiprocket API error): ${err?.message}`,
          );
        }
      }
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
          cartId,
          productVariantId,
        );
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

  async calculateShippingRate(
    userId: string,
    dto: { addressId: string; cartId?: string; productVariantId?: string; qty?: number },
    domain: string,
  ) {
    if (!domain) {
      throw new HttpException(
        CheckoutErrorKeyEnum.COMPANY_DOMAIN_MUST_BE_PROVIDED_IN_HEADERS,
        HttpStatus.BAD_REQUEST,
      );
    }
    const companyId = await this.resolveCompanyId(domain);

    const [companyRecord] = await this.db
      .select()
      .from(company)
      .where(eq(company.id, companyId))
      .limit(1);

    if (!companyRecord) {
      throw new HttpException(CheckoutErrorKeyEnum.COMPANY_NOT_FOUND, HttpStatus.NOT_FOUND);
    }

    const orderLines = await this._resolveOrderLines(
      userId,
      dto.cartId,
      dto.productVariantId,
      dto.qty,
    );

    if (!orderLines || orderLines.length === 0) {
      throw new HttpException(
        CheckoutErrorKeyEnum.NO_VALID_ORDER_LINES_FOUND_FOR_CHECKOUT,
        HttpStatus.BAD_REQUEST,
      );
    }

    const cartSubtotal = orderLines.reduce((acc, line) => acc + line.price * line.quantity, 0);

    const isFreeShipping = companyRecord.is_free_shipping_enabled && cartSubtotal >= Number(companyRecord.free_delivery_threshold);
    const shippingCost = isFreeShipping ? 0 : Number(companyRecord.standard_delivery_charge);

    const threshold = Number(companyRecord.free_delivery_threshold);
    const nudgeAmount = companyRecord.is_free_shipping_enabled && cartSubtotal < threshold
      ? threshold - cartSubtotal
      : 0;

    return {
      shippingCost,
      isFreeShippingEnabled: companyRecord.is_free_shipping_enabled,
      freeDeliveryThreshold: threshold,
      isFreeShipping,
      nudgeAmount,
    };
  }
}
