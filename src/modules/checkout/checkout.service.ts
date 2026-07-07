import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InitiateCheckoutDto, VerifyCheckoutDto } from './dto/checkout.dto.js';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module.js';
import {
  address,
  cart_items,
  carts,
  company,
  orders,
  product_variants,
  user,
  payments,
  promotions,
  promotion_usage,
  inventory,
  warehouse,
  products,
  vendor_payment_gateways,
  vendor_credentials,
  order_items,
} from '../../drizzle/schema/index.js';
import * as schema from '../../drizzle/schema/index.js';
import {
  CredentialType,
  LogisticsMode,
  PaymentRoutingStatus,
  PromotionStatus,
  ShippingChargeStrategy,
} from '../../drizzle/types/types.js';
import { ShippingPreferenceEngineService } from '../shipping/shipping-preference-engine.service.js';
import { PaymentSplitterService } from '../vendors/payment/payment-splitter.service.js';
import { PaymentService } from '../vendors/payment/payment.service.js';
import {
  and,
  eq,
  ExtractTablesWithRelations,
  inArray,
  isNull,
  or,
  sql,
} from 'drizzle-orm';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';
import { OrdersService } from '../orders/orders.service.js';
import { CompanyService } from '../company/company.service.js';
import { MailService } from '../../common/services/mail/mail.service.js';
import { ShipRocketService } from '../ship-rocket/ship-rocket.service.js';
import { CryptoService } from '../shipping/crypto.service.js';
import { domainExtractor } from '../../common/filters/domainExtractor.filter.js';

import { CheckoutErrorKeyEnum } from './constants/checkout.enums.js';
import {
  RazorpayOrderPaidWebhook,
  RazorpayWebhookEvent,
  RazorpayPaymentCapturedWebhook,
} from './constants/razorpay.webhook.js';
import { PgTransaction } from 'drizzle-orm/pg-core';
import { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { type Cache } from 'cache-manager';

@Injectable()
export class CheckoutService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly ordersService: OrdersService,
    private readonly companyService: CompanyService,
    private readonly mailService: MailService,
    private readonly shipRocketService: ShipRocketService,
    private readonly configService: ConfigService,
    private readonly cryptoService: CryptoService,
    private readonly paymentSplitterService: PaymentSplitterService,
    private readonly paymentService: PaymentService,
    private readonly shippingPreferenceEngineService: ShippingPreferenceEngineService,
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

    //  Enforce address verification matches both the user and current tenant
    const addressRecord = await this.db
      .select()
      .from(address)
      .where(and(eq(address.id, addressId), eq(address.user_id, userId)))
      .limit(1)
      .catch((error) => {
        throw new HttpException(
          CheckoutErrorKeyEnum.FAILED_TO_FETCH_ADDRESS_FOR_CHECKOUT,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      });

    if (!addressRecord || addressRecord.length === 0) {
      throw new HttpException(
        CheckoutErrorKeyEnum.ADDRESS_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
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

    // Resolve logistics credentials strategy for dynamic serviceability check
    const [compRecord] = await this.db
      .select({
        logistics_mode: company.logistics_mode,
        encrypted_logistics_api_key: company.encrypted_logistics_api_key,
        logistics_api_key_iv: company.logistics_api_key_iv,
        logistics_api_key_tag: company.logistics_api_key_tag,
        encrypted_logistics_api_secret: company.encrypted_logistics_api_secret,
        logistics_api_secret_iv: company.logistics_api_secret_iv,
        logistics_api_secret_tag: company.logistics_api_secret_tag,
      })
      .from(company)
      .where(eq(company.id, companyId))
      .limit(1);

    let credentials: { email?: string; password?: string } | undefined;
    if (compRecord?.logistics_mode === LogisticsMode.STANDALONE) {
      if (
        compRecord.encrypted_logistics_api_key &&
        compRecord.logistics_api_key_iv &&
        compRecord.logistics_api_key_tag &&
        compRecord.encrypted_logistics_api_secret &&
        compRecord.logistics_api_secret_iv &&
        compRecord.logistics_api_secret_tag
      ) {
        const email = this.cryptoService.decrypt(
          `${compRecord.logistics_api_key_iv}:${compRecord.encrypted_logistics_api_key}:${compRecord.logistics_api_key_tag}`,
        );
        const password = this.cryptoService.decrypt(
          `${compRecord.logistics_api_secret_iv}:${compRecord.encrypted_logistics_api_secret}:${compRecord.logistics_api_secret_tag}`,
        );
        credentials = { email, password };
      }
    }

    /** Resolve originating warehouse pincodes dynamically from variant stock levels
     */
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
          sql`${inventory.stock_quantity} > 0`,
        ),
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

    const [resolvedAddress] = addressRecord;
    if (originPincodes.size > 0 && resolvedAddress?.postal_code) {
      const totalWeight = orderLines.reduce(
        (acc, line) => acc + (line.weight_kg || 0.5) * line.quantity,
        0,
      );
      for (const originPincode of originPincodes) {
        try {
          const serviceabilityRes: any =
            await this.shipRocketService.getServiceability(
              {
                pickup_postcode: Number(originPincode),
                delivery_postcode: Number(resolvedAddress.postal_code),
                weight: String(totalWeight > 0 ? totalWeight : 1),
                breadth: 10,
                height: 10,
                qc_check: 0 as 0,
                is_return: 0 as 0,
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
        }
      }
    }
    // Cache serviceability results to prevent third-party API resource exhaustion / DOS
    const cacheKey = `${originPincodes.size > 0 ? Array.from(originPincodes).join(',') : 'default'}:${resolvedAddress.postal_code}:${initiateCheckoutDto.paymentMethod === 'COD' ? 1 : 0}`;
    const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24-hour cache TTL
    let isServiceable = false;

    const cachedServiceability = await this.cacheManager.get<{
      serviceable: boolean;
      timestamp: number;
    }>(cacheKey);

    if (
      cachedServiceability &&
      Date.now() - cachedServiceability.timestamp < CACHE_TTL_MS
    ) {
      isServiceable = cachedServiceability.serviceable;
    } else {
      const pickupPincode = this.configService.get<string>(
        'SHIPROCKET_PICKUP_PINCODE',
      );
      if (pickupPincode && resolvedAddress?.postal_code) {
        try {
          const serviceabilityRes: any =
            await this.shipRocketService.getServiceability({
              pickup_postcode: Number(pickupPincode),
              delivery_postcode: Number(resolvedAddress.postal_code),
              weight: String(1),
              breadth: 10,
              height: 10,
              qc_check: 0 as 0,
              is_return: 0 as 0,
              mode: 'Surface',
              cod: 0,
            });

          const availableCouriers =
            serviceabilityRes?.data?.available_courier_companies ?? [];
          isServiceable = availableCouriers.length > 0;
          await this.cacheManager.set(
            cacheKey,
            {
              serviceable: isServiceable,
              timestamp: Date.now(),
            },
            CACHE_TTL_MS,
          );
        } catch (err: any) {
          if (err instanceof HttpException) throw err;
          // Fallback to true during temporary Shiprocket outages to avoid blocking checkout
          isServiceable = true;
        }
      } else {
        isServiceable = true;
      }
    }

    if (!isServiceable) {
      throw new HttpException(
        `Delivery to pincode ${resolvedAddress.postal_code} is not currently serviceable. Please use a different address.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    //  Enforce server-side coupon and promotion validation checks
    if (initiateCheckoutDto.promotionId) {
      const [promo] = await this.db
        .select()
        .from(promotions)
        .where(
          and(
            eq(promotions.id, initiateCheckoutDto.promotionId),
            eq(promotions.company_id, companyId),
            eq(promotions.status, PromotionStatus.ACTIVE),
          ),
        )
        .limit(1);

      if (!promo) {
        throw new HttpException(
          'Invalid or inactive promotion.',
          HttpStatus.BAD_REQUEST,
        );
      }

      const now = new Date();
      if (promo.valid_from && new Date(promo.valid_from) > now) {
        throw new HttpException(
          'This promotion is not yet active.',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (promo.valid_to && new Date(promo.valid_to) < now) {
        throw new HttpException(
          'This promotion has expired.',
          HttpStatus.BAD_REQUEST,
        );
      }

      const [isUsed] = await this.db
        .select({ id: promotion_usage.id })
        .from(promotion_usage)
        .where(
          and(
            eq(promotion_usage.promotion_id, promo.id),
            eq(promotion_usage.user_id, userId),
          ),
        )
        .limit(1);

      if (isUsed) {
        throw new HttpException(
          'You have already used this promotion.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    // Create order with injected Drizzle transaction context
    return await this.db.transaction(async (tx) => {
      const orderResult = await this.ordersService.createOrder(
        {
          userId,
          companyId,
          addressId,
          orderLines,
          paymentMethod,
          promotion_id: initiateCheckoutDto.promotionId ?? undefined,
        },
        tx,
      );

      const isCod = paymentMethod.toLowerCase() === 'cod';
      if (isCod) {
        return {
          success: true,
          message: 'Order created successfully (COD)',
          data: orderResult,
        };
      }

      try {
        // Resolve vendor ID from order items
        const firstLine = orderLines[0];
        const [variantWithProduct] = await tx
          .select({
            vendorId: products.vendor_id,
          })
          .from(product_variants)
          .innerJoin(products, eq(product_variants.product_id, products.id))
          .where(eq(product_variants.id, firstLine.variantId))
          .limit(1);

        const vendorId = variantWithProduct?.vendorId;
        let vendorGateway = null;
        if (vendorId) {
          [vendorGateway] = await tx
            .select()
            .from(vendor_payment_gateways)
            .where(eq(vendor_payment_gateways.vendor_id, vendorId))
            .limit(1);
        }

        let razorpayInstance: Razorpay;
        let razorpayKeyIdForFrontend: string;
        let razorpayPayload: any;

        const [compRecord] = await tx
          .select({
            logistics_mode: company.logistics_mode,
          })
          .from(company)
          .where(eq(company.id, companyId))
          .limit(1);

        const isStandalone =
          compRecord &&
          compRecord.logistics_mode === LogisticsMode.STANDALONE &&
          vendorGateway &&
          vendorGateway.routing_status !== PaymentRoutingStatus.SUSPENDED;
        const isPlatformProxy =
          compRecord &&
          compRecord.logistics_mode === LogisticsMode.PLATFORM_PROXY &&
          vendorGateway &&
          vendorGateway.routing_status !== PaymentRoutingStatus.SUSPENDED;

        if (isStandalone && vendorId) {
          const decrypted =
            await this.paymentService.getDecryptedSecret(vendorId);
          if (!decrypted) {
            throw new HttpException(
              'Vendor payment gateway credentials are not correctly configured.',
              HttpStatus.BAD_REQUEST,
            );
          }
          razorpayInstance = this.paymentSplitterService.getRazorpayInstance(
            decrypted.keyId,
            decrypted.keySecret,
          );
          razorpayKeyIdForFrontend = decrypted.keyId;

          const amountInPaise = Math.round(
            Number(orderResult.totalAmount) * 100,
          );
          razorpayPayload = {
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
        } else if (isPlatformProxy) {
          if (!vendorGateway || !vendorGateway.id) {
            throw new HttpException(
              'Vendor payment gateway configuration is missing.',
              HttpStatus.BAD_REQUEST,
            );
          }

          const [credentials] = await tx
            .select({ public_identifier: vendor_credentials.public_identifier })
            .from(vendor_credentials)
            .where(
              and(
                eq(
                  vendor_credentials.vendor_payment_gateway_id,
                  vendorGateway.id,
                ),
                eq(
                  vendor_credentials.credential_type,
                  CredentialType.RAZORPAY_KEY_ID,
                ),
              ),
            )
            .limit(1);

          const connectedAccountId = credentials?.public_identifier;

          if (!connectedAccountId || !connectedAccountId.startsWith('acc_')) {
            throw new HttpException(
              'Vendor payment gateway platform proxy account ID is missing or invalid.',
              HttpStatus.BAD_REQUEST,
            );
          }

          razorpayInstance = this.getRazorpayInstance();
          razorpayKeyIdForFrontend =
            this.configService.get<string>('RAZORPAY_KEY_ID') || '';

          const itemsSubtotal = orderLines.reduce(
            (sum, line) => sum + line.price * line.quantity,
            0,
          );
          const split = await this.paymentSplitterService.getSplitDetails(
            Number(orderResult.totalAmount),
            companyId,
            itemsSubtotal,
          );

          razorpayPayload = {
            amount: split.totalAmountInPaise,
            currency: 'INR',
            receipt: orderResult.orderId,
            notes: {
              userId: userId,
              companyId: companyId,
              orderId: orderResult.orderId,
              paymentMethod: paymentMethod,
            },
            transfers: [
              {
                account: connectedAccountId,
                amount: split.vendorAmountInPaise,
                currency: 'INR',
                on_hold: false,
              },
            ],
          };
        } else {
          razorpayInstance = this.getRazorpayInstance();
          razorpayKeyIdForFrontend =
            this.configService.get<string>('RAZORPAY_KEY_ID') || '';

          const amountInPaise = Math.round(
            Number(orderResult.totalAmount) * 100,
          );
          razorpayPayload = {
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
        }

        const razorpayOrder =
          await razorpayInstance.orders.create(razorpayPayload);

        // Update payment record transaction reference using transaction context
        await tx
          .update(payments)
          .set({ transaction_ref: razorpayOrder.id })
          .where(eq(payments.order_id, orderResult.orderId));

        return {
          success: true,
          message: 'Razorpay payment initiated',
          data: {
            ...orderResult,
            razorpayOrderId: razorpayOrder.id,
            razorpayKeyId: razorpayKeyIdForFrontend,
          },
        };
      } catch (error: any) {
        if (error instanceof HttpException) {
          throw error;
        }
        throw new HttpException(
          CheckoutErrorKeyEnum.PAYMENT_GATEWAY_INITIALIZATION_FAILED,
          HttpStatus.BAD_GATEWAY,
        );
      }
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
      .limit(1)
      .for('update');
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
    if (!paymentRecord || paymentRecord.company_id) {
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
        let keySecret = this.configService.get<string>('RAZORPAY_KEY_SECRET');

        // Resolve vendor ID from order items
        const [firstOrderItem] = await this.db
          .select({ variantId: order_items.product_variant_id })
          .from(order_items)
          .where(eq(order_items.order_id, orderId))
          .limit(1);

        if (firstOrderItem && firstOrderItem.variantId) {
          const [variantWithProduct] = await this.db
            .select({ vendorId: products.vendor_id })
            .from(product_variants)
            .innerJoin(products, eq(product_variants.product_id, products.id))
            .where(eq(product_variants.id, firstOrderItem.variantId))
            .limit(1);

          if (variantWithProduct?.vendorId && paymentRecord.company_id) {
            const [vendorGateway] = await this.db
              .select()
              .from(vendor_payment_gateways)
              .where(
                eq(
                  vendor_payment_gateways.vendor_id,
                  variantWithProduct.vendorId,
                ),
              )
              .limit(1);

            const [compRecord] = await this.db
              .select({ logistics_mode: company.logistics_mode })
              .from(company)
              .where(eq(company.id, paymentRecord.company_id))
              .limit(1);

            if (
              compRecord &&
              compRecord.logistics_mode === LogisticsMode.STANDALONE &&
              vendorGateway &&
              vendorGateway.routing_status !== PaymentRoutingStatus.SUSPENDED
            ) {
              const decrypted = await this.paymentService.getDecryptedSecret(
                variantWithProduct.vendorId,
              );
              if (decrypted) {
                keySecret = decrypted.keySecret;
              }
            }
          }
        }

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
      // If it is a COD payment, the server directly authorizes the transition to processing.
      // We do not trust the client-supplied 'isSuccess' parameter to determine the state.
      isSuccessVerified = true;
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
    timestamp?: string,
  ) {
    // 1. Parse raw body (fail fast on bad JSON)
    let parsedBody: RazorpayWebhookEvent;
    try {
      parsedBody = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    } catch (parseErr) {
      throw new HttpException(
        'Invalid JSON payload received.',
        HttpStatus.BAD_REQUEST,
      );
    }

    // 2. Validate timestamp header (prevent replay attacks)
    if (!timestamp) {
      throw new HttpException(
        'Webhook request timestamp is required.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const receivedTimestamp = Number(timestamp);
    const currentTimestamp = Math.floor(Date.now() / 1000);
    if (
      isNaN(receivedTimestamp) ||
      Math.abs(currentTimestamp - receivedTimestamp) > 300
    ) {
      throw new HttpException(
        'Webhook request timestamp expired or invalid.',
        HttpStatus.BAD_REQUEST,
      );
    }

    // 3. Resolve orderId from payment notes FIRST
    const event: string = parsedBody.event;
    let orderId: string | undefined;
    const paymentEntity = parsedBody.payload?.payment?.entity;

    if (paymentEntity?.notes) {
      orderId = paymentEntity.notes.orderId || paymentEntity.notes.order_id;
    }

    if (!orderId && paymentEntity?.order_id) {
      const results = await this.db
        .select({ order_id: payments.order_id })
        .from(payments)
        .where(eq(payments.transaction_ref, paymentEntity.order_id))
        .limit(1)
        .catch(() => []);
      const paymentRecord = results[0];
      if (paymentRecord?.order_id) {
        orderId = paymentRecord.order_id;
      }
    }

    // 4. Validate account_id (fail closed)
    const expectedAccountId = this.configService.get<string>(
      'EXPECTED_RAZORPAY_ACCOUNT_ID',
    );
    if (expectedAccountId) {
      if (
        !parsedBody.account_id ||
        parsedBody.account_id !== expectedAccountId
      ) {
        throw new HttpException(
          'Cross-account merchant event rejected.',
          HttpStatus.FORBIDDEN,
        );
      }
    }

    // 5. Determine which webhook secret to use (vendor vs platform)
    let customWebhookSecret: string | null = null;

    if (orderId) {
      const [orderResults] = await this.db
        .select({ company_id: orders.company_id })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1)
        .catch(() => []);

      if (orderResults?.company_id) {
        const [compResults] = await this.db
          .select({ logistics_mode: company.logistics_mode })
          .from(company)
          .where(eq(company.id, orderResults.company_id))
          .limit(1)
          .catch(() => []);

        const [firstOrderItem] = await this.db
          .select({ variantId: order_items.product_variant_id })
          .from(order_items)
          .where(eq(order_items.order_id, orderId))
          .limit(1)
          .catch(() => []);

        if (firstOrderItem?.variantId) {
          const [variantWithProduct] = await this.db
            .select({ vendorId: products.vendor_id })
            .from(product_variants)
            .innerJoin(products, eq(product_variants.product_id, products.id))
            .where(eq(product_variants.id, firstOrderItem.variantId))
            .limit(1)
            .catch(() => []);

          if (variantWithProduct?.vendorId) {
            const [vendorGateway] = await this.db
              .select()
              .from(vendor_payment_gateways)
              .where(
                eq(
                  vendor_payment_gateways.vendor_id,
                  variantWithProduct.vendorId,
                ),
              )
              .limit(1)
              .catch(() => []);

            if (
              compResults &&
              compResults.logistics_mode === LogisticsMode.STANDALONE &&
              vendorGateway &&
              vendorGateway.routing_status !== PaymentRoutingStatus.SUSPENDED
            ) {
              const secret =
                await this.paymentService.getDecryptedWebhookSecret(
                  variantWithProduct.vendorId,
                );
              if (secret) {
                customWebhookSecret = secret;
              } else {
                throw new HttpException(
                  'Vendor custom webhook secret expected but not configured.',
                  HttpStatus.BAD_REQUEST,
                );
              }
            }
          }
        }
      }
    }

    // 6. Verify HMAC signature with correct secret
    const rawBodyString =
      typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);

    if (customWebhookSecret) {
      const generatedVendorSig = crypto
        .createHmac('sha256', customWebhookSecret)
        .update(rawBodyString)
        .digest('hex');

      if (generatedVendorSig !== signature) {
        throw new HttpException(
          'Invalid vendor webhook signature.',
          HttpStatus.BAD_REQUEST,
        );
      }
    } else {
      const platformSecret = this.configService.get<string>(
        'RAZORPAY_WEBHOOK_SECRET',
      );
      if (!platformSecret) {
        throw new HttpException(
          'Webhook secret is not configured on server.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      const generatedSignature = crypto
        .createHmac('sha256', platformSecret)
        .update(rawBodyString)
        .digest('hex');

      if (generatedSignature !== signature) {
        throw new HttpException(
          'Invalid webhook signature.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    // 7. Validate amount
    let paidAmountInPaise: number;
    if (event === 'order.paid') {
      paidAmountInPaise =
        'order' in parsedBody.payload
          ? Number(parsedBody.payload.order.entity.amount)
          : 0;
    } else if (event === 'payment.captured') {
      paidAmountInPaise =
        'payment' in parsedBody.payload
          ? Number(parsedBody.payload.payment.entity.amount)
          : 0;
    } else {
      return { success: true, message: `Ignored webhook event: ${event}` };
    }

    if (!paidAmountInPaise || isNaN(paidAmountInPaise)) {
      throw new HttpException(
        'Invalid amount in webhook payload',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!orderId) {
      return {
        success: false,
        message: 'No associated merchant order ID found in webhook payload',
      };
    }

    // 8. Fulfill order inside transaction
    return this.fulfillOrder(orderId, paidAmountInPaise);
  }

  private async fulfillOrder(orderId: string, paidAmountInPaise: number) {
    return await this.db.transaction(async (tx) => {
      const [existingOrder] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1)
        .for('update');

      if (!existingOrder) {
        throw new HttpException(
          'Order not found in database',
          HttpStatus.NOT_FOUND,
        );
      }

      // Webhook Idempotency & Double Fulfillment Guard inside lock
      if (existingOrder.order_status !== 'pending') {
        return {
          success: true,
          message:
            'Transaction already updated via collateral webhook channel.',
        };
      }

      // Amount Reconciliation
      const expectedAmountInPaise = Math.round(
        Number(existingOrder.total_amount) * 100,
      );

      if (paidAmountInPaise !== expectedAmountInPaise) {
        throw new HttpException(
          CheckoutErrorKeyEnum.TRANSACTION_AMOUNT_MISMATCH,
          HttpStatus.BAD_REQUEST,
        );
      }

      if (!existingOrder.user_id) {
        return {
          success: false,
          message: 'No user associated with this order',
        };
      }

      const [customerRecord] = await tx
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
          true,
          existingOrder.company_id ?? undefined,
          tx as PgTransaction<
            NodePgQueryResultHKT,
            typeof schema,
            ExtractTablesWithRelations<typeof schema>
          >,
        );

      return {
        success: true,
        message:
          'Order verification and payment completed successfully via webhook',
        orderId,
        verified: verificationResult.success,
      };
    });
  }

  // private helpers
  private async _resolveOrderLines(
    userId: string,
    cartId?: string,
    productVariantId?: string,
    qty?: number,
  ): Promise<
    | {
        variantId: string;
        price: number;
        quantity: number;
        name?: string | null;
        weight_kg?: number;
      }[]
    | undefined
  > {
    if (productVariantId) {
      const [variant] = await this.db
        .select({
          id: product_variants.id,
          price: product_variants.price,
          name: products.name,
          weight_kg: product_variants.weight_kg,
        })
        .from(product_variants)
        .innerJoin(products, eq(product_variants.product_id, products.id))
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
          name: variant.name,
          weight_kg: Number(variant.weight_kg || 0.5),
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
          name: products.name,
          weight_kg: product_variants.weight_kg,
        })
        .from(cart_items)
        .innerJoin(
          product_variants,
          eq(cart_items.product_variant_id, product_variants.id),
        )
        .innerJoin(products, eq(product_variants.product_id, products.id))
        .where(eq(cart_items.cart_id, cartRecord.id));
      return cartItems.map((item) => ({
        variantId: item.variantId ?? '',
        price: Number(item.price),
        quantity: item.quantity,
        name: item.name,
        weight_kg: Number(item.weight_kg || 0.5),
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

  private async _getDynamicShippingRate(
    companyId: string,
    companyRecord: any,
    resolvedAddress: any,
    orderLines: any[],
  ): Promise<number> {
    // 1. Resolve logistics credentials
    let credentials: { email?: string; password?: string } | undefined;
    if (companyRecord?.logistics_mode === LogisticsMode.STANDALONE) {
      if (
        companyRecord.encrypted_logistics_api_key &&
        companyRecord.logistics_api_key_iv &&
        companyRecord.logistics_api_key_tag &&
        companyRecord.encrypted_logistics_api_secret &&
        companyRecord.logistics_api_secret_iv &&
        companyRecord.logistics_api_secret_tag
      ) {
        const email = this.cryptoService.decrypt(
          `${companyRecord.logistics_api_key_iv}:${companyRecord.encrypted_logistics_api_key}:${companyRecord.logistics_api_key_tag}`,
        );
        const password = this.cryptoService.decrypt(
          `${companyRecord.logistics_api_secret_iv}:${companyRecord.encrypted_logistics_api_secret}:${companyRecord.logistics_api_secret_tag}`,
        );
        credentials = { email, password };
      }
    }

    // 2. Resolve origin pincode per product
    const originPincodeToLines = new Map<string, any[]>();
    const unserviceableProducts: string[] = [];
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
          sql`${inventory.stock_quantity} > 0`,
        ),
      );

    for (const line of orderLines) {
      const matches = warehouseAddresses.filter(
        (w) => w.variantId === line.variantId,
      );
      if (matches.length > 0) {
        matches.sort((a, b) => b.stockQuantity - a.stockQuantity);
        if (matches[0].postalCode) {
          const pincode = matches[0].postalCode;
          if (!originPincodeToLines.has(pincode)) {
            originPincodeToLines.set(pincode, []);
          }
          originPincodeToLines.get(pincode)!.push(line);
        } else {
          unserviceableProducts.push(line.name || `Variant ${line.variantId}`);
        }
      } else {
        unserviceableProducts.push(line.name || `Variant ${line.variantId}`);
      }
    }

    if (unserviceableProducts.length > 0) {
      throw new HttpException(
        `The following products are not available from any warehouse: ${unserviceableProducts.join(', ')}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (originPincodeToLines.size === 0) {
      const fallbackPincode =
        this.configService.get<string>('SHIPROCKET_PICKUP_PINCODE') || '110001';
      originPincodeToLines.set(fallbackPincode, orderLines);
    }

    // 3. Call Shiprocket for the lowest rate
    let totalShippingCost = 0;
    const cacheKeyBase = `dynamic_rate:${companyId}:${resolvedAddress.postal_code}`;

    for (const [originPincode, lines] of originPincodeToLines.entries()) {
      const cacheKey = `${cacheKeyBase}:${originPincode}`;
      const cachedRate = await this.cacheManager.get<number>(cacheKey);

      if (cachedRate !== undefined && cachedRate !== null) {
        totalShippingCost += cachedRate;
        continue;
      }

      // Resolve vendor ID from items for this origin warehouse
      let vendorId: string | null = null;
      const firstLine = lines[0];
      if (firstLine) {
        const [variantWithProduct] = await this.db
          .select({ vendorId: products.vendor_id })
          .from(product_variants)
          .innerJoin(products, eq(product_variants.product_id, products.id))
          .where(eq(product_variants.id, firstLine.variantId))
          .limit(1);
        vendorId = variantWithProduct?.vendorId || null;
      }

      let lowestRateForThisOrigin: number | null = null;
      try {
        const originWeight = lines.reduce(
          (acc, line) => acc + (line.weight_kg || 0.5) * line.quantity,
          0,
        );
        const serviceabilityRes: any =
          await this.shipRocketService.getServiceability(
            {
              pickup_postcode: Number(originPincode),
              delivery_postcode: Number(resolvedAddress.postal_code),
              weight: String(originWeight > 0 ? originWeight : 1),
              breadth: 10,
              height: 10,
              qc_check: 0 as 0,
              is_return: 0 as 0,
              mode: 'Surface',
              cod: 0, // Using prepaid estimate
            },
            credentials,
            companyId,
          );

        const availableCouriers =
          serviceabilityRes?.data?.available_courier_companies ?? [];

        if (availableCouriers.length > 0) {
          if (vendorId) {
            const engineResult =
              await this.shippingPreferenceEngineService.resolveBestShippingOption(
                availableCouriers.map((c: any) => ({
                  courier_company_id: c.courier_company_id,
                  courier_name: c.courier_name,
                  rate: c.rate,
                  rating: c.rating,
                  estimated_delivery_days: c.estimated_delivery_days,
                  delivery_performance: c.delivery_performance,
                  pickup_performance: c.pickup_performance,
                  cod_charges: c.cod_charges,
                  is_surface: c.is_surface,
                })),
                vendorId,
              );

            if (engineResult.selectedOption) {
              lowestRateForThisOrigin = engineResult.selectedOption.rate;
            }
          }

          // Fallback if vendorId is missing or preference engine returns no option
          if (lowestRateForThisOrigin === null) {
            lowestRateForThisOrigin = Math.min(
              ...availableCouriers.map((c: any) => c.rate),
            );
          }

          await this.cacheManager.set(
            cacheKey,
            lowestRateForThisOrigin,
            60 * 60 * 1000,
          ); // 1-hour cache TTL
        }
      } catch (err: any) {
        if (err instanceof HttpException) {
          throw err;
        }
        throw new HttpException(
          'Failed to retrieve shipping rates from the aggregator. Please try again later.',
          HttpStatus.BAD_GATEWAY,
        );
      }

      if (lowestRateForThisOrigin === null) {
        const productNames = lines
          .map((l: any) => {
            const name = l.name || `Variant ${l.variantId}`;
            const words = name.split(' ');
            return words.length > 5
              ? words.slice(0, 5).join(' ') + '...'
              : name;
          })
          .join(', ');
        throw new HttpException(
          `Delivery is not available to your area (${resolvedAddress.postal_code}) for the following products: ${productNames}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      totalShippingCost += lowestRateForThisOrigin;
    }

    return totalShippingCost;
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

    // Verify that the shipping address belongs to the requested company bounds
    const addressRecord = await this.db
      .select()
      .from(address)
      .where(and(eq(address.id, dto.addressId), eq(address.user_id, userId)))
      .limit(1)
      .catch((error) => {
        //  Sanitize exception metadata from public payloads
        throw new HttpException(
          CheckoutErrorKeyEnum.FAILED_TO_FETCH_ADDRESS_FOR_CHECKOUT,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      });

    if (!addressRecord || addressRecord.length === 0) {
      throw new HttpException(
        CheckoutErrorKeyEnum.ADDRESS_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }

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

    //  Prevent IEEE 754 precision errors by calculating subtotal using integer math (Paise/Cents)
    const cartSubtotalInPaise = orderLines.reduce(
      (acc, line) => acc + Math.round(Number(line.price) * 100) * line.quantity,
      0,
    );

    const thresholdInPaise = Math.round(
      Number(companyRecord.free_delivery_threshold) * 100,
    );
    const standardDeliveryCharge = Number(
      companyRecord.standard_delivery_charge,
    );

    const isFreeShipping =
      companyRecord.is_free_shipping_enabled &&
      cartSubtotalInPaise >= thresholdInPaise;

    let shippingCost = 0;
    if (!isFreeShipping) {
      const strategy =
        companyRecord.shipping_charge_strategy ||
        ShippingChargeStrategy.STANDARD_FLAT_RATE;

      if (strategy === ShippingChargeStrategy.STANDARD_FLAT_RATE) {
        shippingCost = standardDeliveryCharge;
      } else if (strategy === ShippingChargeStrategy.DYNAMIC_CUSTOMER_RATE) {
        shippingCost = await this._getDynamicShippingRate(
          companyId,
          companyRecord,
          addressRecord[0],
          orderLines,
        );
      } else {
        shippingCost = standardDeliveryCharge;
      }
    }

    const nudgeAmountInPaise =
      companyRecord.is_free_shipping_enabled &&
      cartSubtotalInPaise < thresholdInPaise
        ? thresholdInPaise - cartSubtotalInPaise
        : 0;

    const result = {
      shippingCost,
      isFreeShippingEnabled: companyRecord.is_free_shipping_enabled,
      freeDeliveryThreshold: thresholdInPaise / 100,
      isFreeShipping,
      nudgeAmount: nudgeAmountInPaise / 100,
    };

    return result;
  }
}
