import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { InitiateCheckoutDto, VerifyCheckoutDto } from './dto/checkout.dto';
import { type DrizzleDB } from 'src/drizzle/types/drizzle';
import { DRIZZLE } from 'src/drizzle/drizzle.module';
import {
  address,
  cart_items,
  carts,
  company,
  product_variants,
} from 'src/drizzle/schema';
import { and, eq, or } from 'drizzle-orm';
import { OrdersService } from '../orders/orders.service';
import { CompanyService } from '../company/company.service';

@Injectable()
export class CheckoutService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly ordersService: OrdersService,
    private readonly companyService: CompanyService,
  ) {}
  async initiateCheckout(
    userId: string,
    initiateCheckoutDto: InitiateCheckoutDto,
    domain: string,
  ) {
    const { addressId, paymentMethod, cartId, productVariantId } =
      initiateCheckoutDto;
    console.log('cartId ', cartId, ' productVariantId ', productVariantId);
    if (!cartId && !productVariantId) {
      throw new HttpException(
        'Either cartId or productVariantId must be provided',
        HttpStatus.BAD_REQUEST,
      );
    }
    console.log('domain', domain);
    if (!domain) {
      throw new HttpException(
        'Company domain must be provided in headers',
        HttpStatus.BAD_REQUEST,
      );
    }
    const companyId = await this.companyService.find(domain);

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
    return await this.ordersService.createOrder({
      userId,
      companyId,
      addressId,
      orderLines,
      paymentMethod,
    });
  }

  async verifyCheckout(dto: VerifyCheckoutDto, domain: string) {
    const { orderId, isSuccess, cartId, productVariantId } = dto;
    const [companyRecord] = await this.db
      .select({ id: company.id })
      .from(company)
      .where(or(eq(company.company_domain, domain), eq(company.id, domain)))
      .limit(1);
    if (!companyRecord) {
      throw new HttpException('Company not found', HttpStatus.NOT_FOUND);
    }

    await this.ordersService
      .getOrderById(orderId, companyRecord.id)
      .then((order) => {
        if (!order) {
          throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
        }
      });
    try {
      const verificationResult =
        await this.ordersService.completeOrderVerification(
          orderId,
          isSuccess,
          companyRecord.id,
        );
      if (verificationResult.success) {
        if (cartId) {
          await this._clearCart(this.db, cartId, orderId);
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

  private async _clearCart(tx: DrizzleDB, cartId: string, userId: string) {
    await tx
      .delete(carts)
      .where(and(eq(carts.id, cartId), eq(carts.user_id, userId)));
  }
}
