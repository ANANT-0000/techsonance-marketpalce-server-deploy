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
  orders,
  product_variants,
  user,
  payments,
} from '../../drizzle/schema';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';
import { OrdersService } from '../orders/orders.service';
import { CompanyService } from '../company/company.service';
import { MailService } from '../../common/services/mail/mail.service';
import { ShipRocketService } from '../ship-rocket/ship-rocket.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';

import { CheckoutErrorKeyEnum } from './constants/checkout.enums';
import {
  RazorpayOrderPaidWebhook,
  RazorpayWebhookEvent,
  RazorpayPaymentCapturedWebhook,
} from './constants/razorpay.webhook';
import { Orders } from 'razorpay/dist/types/orders';

@Injectable()
export class CheckoutService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly ordersService: OrdersService,
    private readonly companyService: CompanyService,
    private readonly mailService: MailService,
    private readonly shipRocketService: ShipRocketService,
    private readonly configService: ConfigService,
  ) {}

  private getRazorpayInstance(): Razorpay {
    const keyId = this.configService.get<string>('RAZORPAY_KEY_ID');
    const keySecret = this.configService.get<string>('RAZORPAY_KEY_SECRET');
    if (!keyId || !keySecret) {
      throw new HttpException(
        'Payment gateway credentials are not configured.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return new Razorpay({ key_id: keyId, key_secret: keySecret });
  }

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
      throw new HttpException(
        CheckoutErrorKeyEnum.ADDRESS_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
    const [resolvedAddress] = addressRecord;

    // ── Pincode serviceability check ──────────────────────────────────────
    // Validate that at least one Shiprocket courier serves this pincode
    // BEFORE creating the order.  This prevents paid-but-unshippable orders.
    // We use placeholder dimensions (1 kg, 10×10×10 cm) because serviceability
    // is pincode-based; exact weight only affects rate, not coverage.
    const pickupPincode = this.configService.get<string>(
      'SHIPROCKET_PICKUP_PINCODE',
    );
    if (pickupPincode && resolvedAddress?.postal_code) {
      try {
        const serviceabilityRes: any =
          await this.shipRocketService.getServiceability({
            pickup_pincode: pickupPincode,
            delivery_pincode: resolvedAddress.postal_code,
            weight: 1,
            breadth: 10,
            height: 10,
            qc_check: 0,
            is_return: 0,
            mode: 'Surface',
            cod: 0,
          });

        const availableCouriers =
          serviceabilityRes?.data?.available_courier_companies ?? [];
        if (availableCouriers.length === 0) {
          throw new HttpException(
            `Delivery to pincode ${resolvedAddress.postal_code} is not currently serviceable. Please use a different address.`,
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
    const orderResult = await this.ordersService.createOrder({
      userId,
      companyId,
      addressId,
      orderLines,
      paymentMethod,
      promotion_id: initiateCheckoutDto.promotionId ?? undefined,
    });

    const isCod = paymentMethod.toLowerCase() === 'cod';
    if (isCod) {
      return {
        success: true,
        message: 'Order created successfully (COD)',
        data: orderResult,
      };
    }

    try {
      const razorpay = this.getRazorpayInstance();
      const amountInPaise = Math.round(Number(orderResult.totalAmount) * 100);
      const razorpayPayload: Orders.RazorpayOrderCreateRequestBody = {
        amount: amountInPaise,
        currency: 'INR',
        receipt: orderResult.orderId,
        notes: {
          userId: userId,
          companyId: companyId,
          orderId: orderResult.orderId,
          paymentMethod: paymentMethod,
        },
      };
      const razorpayOrder = await razorpay.orders.create(razorpayPayload);

      // Update payment record transaction reference with the Razorpay order ID
      await this.db
        .update(payments)
        .set({ transaction_ref: razorpayOrder.id })
        .where(eq(payments.order_id, orderResult.orderId));

      return {
        success: true,
        message: 'Razorpay payment initiated',
        data: {
          ...orderResult,
          razorpayOrderId: razorpayOrder.id,
          razorpayKeyId: this.configService.get<string>('RAZORPAY_KEY_ID'),
        },
      };
    } catch (error: any) {
      // Rollback order stock level or cancel if Razorpay order creation fails
      try {
        await this.ordersService.completeOrderVerification(
          { email: '', first_name: '', last_name: '' },
          {
            id: orderResult.orderId,
            total_amount: orderResult.totalAmount || '0',
            created_at: new Date(),
            updated_at: new Date(),
            user_id: userId,
            address_id: addressId,
            company_id: companyId,
          },
          orderResult.orderId,
          false, // marks failure and cancels order
          companyId,
          cartId,
          productVariantId,
        );
      } catch (rollbackErr) {}

      let errorMessage = '';
      if (error && typeof error === 'object') {
        errorMessage =
          error.message ||
          error.description ||
          (error.error && typeof error.error === 'object'
            ? error.error.description || JSON.stringify(error.error)
            : '') ||
          JSON.stringify(error);
      } else {
        errorMessage = String(error);
      }

      throw new HttpException(
        `Failed to initialize payment gateway: ${errorMessage}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async verifyCheckout(dto: VerifyCheckoutDto, domain: string) {
    const {
      discountApplied,
      promotionId,
      orderId,
      isSuccess,
      cartId,
      productVariantId,
      razorpayPaymentId,
      razorpayOrderId,
      razorpaySignature,
    } = dto;

    const companyId = await this.resolveCompanyId(domain);
    if (!companyId) {
      throw new HttpException(
        CheckoutErrorKeyEnum.COMPANY_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }

    const [existingOrder] = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.company_id, companyId)))
      .limit(1);
    if (!existingOrder || !existingOrder.user_id) {
      throw new HttpException(
        CheckoutErrorKeyEnum.USER_NOT_FOUND,
        HttpStatus.BAD_REQUEST,
      );
    }

    const [paymentRecord] = await this.db
      .select()
      .from(payments)
      .where(eq(payments.order_id, orderId))
      .limit(1);
    if (!paymentRecord) {
      throw new HttpException(
        'Payment record not found for verification.',
        HttpStatus.NOT_FOUND,
      );
    }

    const isOnlinePayment =
      paymentRecord.payment_method.toLowerCase() !== 'cod';
    let isSuccessVerified = isSuccess;

    // Enforce Razorpay signature validation for online payments
    if (isOnlinePayment) {
      if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        isSuccessVerified = false;
      } else {
        const keySecret = this.configService.get<string>('RAZORPAY_KEY_SECRET');
        if (!keySecret) {
          throw new HttpException(
            'Payment gateway credentials are not configured on server.',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }

        const generatedSignature = crypto
          .createHmac('sha256', keySecret)
          .update(`${razorpayOrderId}|${razorpayPaymentId}`)
          .digest('hex');

        if (generatedSignature !== razorpaySignature) {
          isSuccessVerified = false;
        } else {
          isSuccessVerified = true;
        }
      }
    } else {
      // If it is a COD payment, we don't have Razorpay signatures, so we trust client parameter isSuccess
      isSuccessVerified = isSuccess;
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
        !customerRecord.email ||
        !customerRecord.first_name ||
        !customerRecord.last_name
      ) {
        throw new HttpException(
          CheckoutErrorKeyEnum.CUSTOMER_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }
      const customerDetails = {
        email: customerRecord.email,
        first_name: customerRecord.first_name as string,
        last_name: customerRecord.last_name as string,
      };
      const verificationResult =
        await this.ordersService.completeOrderVerification(
          customerDetails,
          existingOrder,
          orderId,
          isSuccessVerified,
          companyId,
          cartId,
          productVariantId,
        );

      if (!isSuccessVerified) {
        throw new HttpException(
          'Payment verification failed: Signature mismatch or invalid payment.',
          HttpStatus.BAD_REQUEST,
        );
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
      throw new InternalServerErrorException(
        CheckoutErrorKeyEnum.FAILED_TO_VERIFY_CHECKOUT,
        {
          cause: error,
        },
      );
    }
  }
  async handleRazorpayWebhook(
    rawBody: string | RazorpayWebhookEvent,
    signature: string,
  ) {
    const webhookSecret = this.configService.get<string>(
      'RAZORPAY_WEBHOOK_SECRET',
    );
    if (!webhookSecret) {
      throw new HttpException(
        'Webhook secret is not configured on server.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const rawBodyString =
      typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);

    let parsedBody: RazorpayWebhookEvent;
    try {
      parsedBody = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    } catch (parseErr) {
      throw new HttpException(
        'Invalid JSON payload received.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const generatedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBodyString)
      .digest('hex');

    if (generatedSignature !== signature) {
      throw new HttpException(
        'Invalid webhook signature.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const event: string = parsedBody.event;

    switch (event) {
      case 'order.paid': {
        return this.handleOrderPaidWebhook(
          parsedBody as RazorpayOrderPaidWebhook,
        );
      }
      case 'payment.captured': {
        return this.handlePaymentCapturedWebhook(
          parsedBody as RazorpayPaymentCapturedWebhook,
        );
      }
      default: {
        return { success: true, message: `Ignored webhook event: ${event}` };
      }
    }
  }

  private async handlePaymentCapturedWebhook(
    payload: RazorpayPaymentCapturedWebhook,
  ) {
    const paymentEntity = payload.payload?.payment?.entity;
    let orderId = paymentEntity?.notes?.orderId;

    if (!orderId && paymentEntity?.order_id) {
      // Fallback: lookup by Razorpay order ID in payments table
      const [paymentRecord] = await this.db
        .select({ order_id: payments.order_id })
        .from(payments)
        .where(eq(payments.transaction_ref, paymentEntity.order_id))
        .limit(1)
        .catch((err) => {
          throw new InternalServerErrorException(
            CheckoutErrorKeyEnum.PAYMENT_NOT_FOUND,
            {
              cause: err,
            },
          );
        });
      if (!paymentRecord.order_id) {
        throw new HttpException(
          CheckoutErrorKeyEnum.PAYMENT_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }
      orderId = paymentRecord?.order_id;
    }

    if (!orderId) {
      return {
        success: false,
        message: 'No associated merchant order ID found in webhook payload',
      };
    }

    const [existingOrder] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!existingOrder) {
      return { success: false, message: 'Order not found in database' };
    }

    if (!existingOrder.user_id) {
      return {
        success: false,
        message: 'No user associated with this order',
      };
    }

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
      !customerRecord.email ||
      !customerRecord.first_name ||
      !customerRecord.last_name
    ) {
      throw new HttpException(
        CheckoutErrorKeyEnum.CUSTOMER_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }

    const customerDetails = {
      email: customerRecord.email,
      first_name: customerRecord.first_name as string,
      last_name: customerRecord.last_name as string,
    };

    const verificationResult =
      await this.ordersService.completeOrderVerification(
        customerDetails,
        existingOrder,
        orderId,
        true, // marks order paid and moves to processing
        existingOrder.company_id ?? undefined,
      );

    return {
      success: true,
      message: 'Payment captured verification completed via webhook',
      orderId,
      verified: verificationResult.success,
    };
  }

  private async handleOrderPaidWebhook(payload: RazorpayOrderPaidWebhook) {
    const orderEntity = payload.payload?.order?.entity;
    const orderId = orderEntity?.receipt;

    if (!orderId) {
      return {
        success: false,
        message: 'No receipt order ID found in webhook payload',
      };
    }

    const [existingOrder] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!existingOrder) {
      return { success: false, message: 'Order not found in database' };
    }

    if (!existingOrder.user_id) {
      return {
        success: false,
        message: 'No user associated with this order',
      };
    }

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
      !customerRecord.email ||
      !customerRecord.first_name ||
      !customerRecord.last_name
    ) {
      throw new HttpException(
        CheckoutErrorKeyEnum.CUSTOMER_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }

    const customerDetails = {
      email: customerRecord.email,
      first_name: customerRecord.first_name as string,
      last_name: customerRecord.last_name as string,
    };

    const verificationResult =
      await this.ordersService.completeOrderVerification(
        customerDetails,
        existingOrder,
        orderId,
        true, // marks order paid and moves to processing
        existingOrder.company_id ?? undefined,
      );

    return {
      success: true,
      message: 'Order paid verification completed via webhook',
      orderId,
      verified: verificationResult.success,
    };
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
        throw new HttpException(
          CheckoutErrorKeyEnum.CART_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
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
    dto: {
      addressId: string;
      cartId?: string;
      productVariantId?: string;
      qty?: number;
    },
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
      throw new HttpException(
        CheckoutErrorKeyEnum.COMPANY_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
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

    const cartSubtotal = orderLines.reduce(
      (acc, line) => acc + line.price * line.quantity,
      0,
    );

    const isFreeShipping =
      companyRecord.is_free_shipping_enabled &&
      cartSubtotal >= Number(companyRecord.free_delivery_threshold);
    const shippingCost = isFreeShipping
      ? 0
      : Number(companyRecord.standard_delivery_charge);

    const threshold = Number(companyRecord.free_delivery_threshold);
    const nudgeAmount =
      companyRecord.is_free_shipping_enabled && cartSubtotal < threshold
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
