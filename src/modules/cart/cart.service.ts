import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateCartDto } from './dto/create-cart.dto';
import { UpdateCartDto } from './dto/update-cart.dto';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import {
  cart_items,
  carts,
  company,
  product_variants,
} from '../../drizzle/schema';
import { and, eq, or, sql } from 'drizzle-orm';
import { CompanyService } from '../company/company.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { CartErrorKeyEnum } from './constants/cart.enums';

@Injectable()
export class CartService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
  ) {}
  private async resolveCompanyId(domain: string): Promise<string> {
    const filterDomain = domainExtractor(domain);
    return this.companyService.find(filterDomain);
  }
  async create(
    createCartDto: CreateCartDto,
    customerId: string,
    domain: string,
  ) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      if (!companyId) {
        throw new HttpException(
          CartErrorKeyEnum.COMPANY_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }
      const [isProductVariantExist] = await this.db
        .select({ id: product_variants.id })
        .from(product_variants)
        .where(eq(product_variants.id, createCartDto.productVariantId));
      if (!isProductVariantExist.id || isProductVariantExist.id === '') {
        throw new HttpException(
          CartErrorKeyEnum.PRODUCT_VARIANT_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }
      const cartRecord = await this.db.transaction(async (tx) => {
        const [isExitingCart] = await tx
          .select({ id: carts.id, user_id: carts.user_id })
          .from(carts)
          .where(eq(carts.user_id, customerId));
        if (isExitingCart && isExitingCart.user_id === customerId) {
          const [createCartItem] = await tx
            .insert(cart_items)
            .values({
              cart_id: isExitingCart.id,
              product_variant_id: createCartDto.productVariantId,
              quantity: createCartDto.quantity,
            })
            .onConflictDoUpdate({
              target: [cart_items.cart_id, cart_items.product_variant_id],
              set: {
                // quantity: sql`${cart_items.quantity} + 1`,
                quantity: createCartDto.quantity,
                updated_at: new Date(),
              },
            })
            .returning();

          return {
            cart_id: isExitingCart.id,
            cart_item_id: createCartItem.id,
            quantity: createCartItem.quantity,
            product_variant_id: createCartItem.product_variant_id,
          };
        } else {
          const [createCart] = await tx
            .insert(carts)
            .values({
              company_id: companyId,
              user_id: customerId,
            })
            .returning({ id: carts.id })
            .catch((error) => {
              throw new InternalServerErrorException(
                CartErrorKeyEnum.FAILED_TO_CREATE_CART,
                {
                  cause: error,
                },
              );
            });
          const [createCartItem] = await tx
            .insert(cart_items)
            .values({
              cart_id: createCart.id,
              product_variant_id: createCartDto.productVariantId,
              quantity: createCartDto.quantity,
            })
            .returning()
            .catch((error) => {
              throw new InternalServerErrorException(
                CartErrorKeyEnum.FAILED_TO_CREATE_CART_ITEM,
                {
                  cause: error,
                },
              );
            });
          return {
            cart_id: createCart.id,
            cart_item_id: createCartItem.id,
            quantity: createCartItem.quantity,
            product_variant_id: createCartItem.product_variant_id,
          };
        }
      });
      return cartRecord;
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof NotFoundException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        CartErrorKeyEnum.FAILED_TO_CREATE_CART_ITEM,
        {
          cause: error,
        },
      );
    }
  }

  async findAll(
    customerId: string,
    domain: string,
    filters: { limit: number; offset: number },
  ) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const [isUserCartExits] = await this.db
        .select({ id: carts.id })
        .from(carts)
        .where(
          and(eq(carts.user_id, customerId), eq(carts.company_id, companyId)),
        );
      if (isUserCartExits === undefined || isUserCartExits.id === '') {
        throw new NotFoundException(CartErrorKeyEnum.USER_CART_NOT_FOUND);
      }
      const cartItems = await this.db.query.cart_items
        .findMany({
          where: (cart_item) => eq(cart_item.cart_id, isUserCartExits.id),

          limit: filters?.limit ?? 10,
          offset: filters?.offset ?? 0,

          with: {
            productVariant: {
              columns: {
                variant_name: true,
                id: true,
                price: true,
                product_id: true,
                sku: true,
              },
              with: {
                inventory: {
                  columns: {
                    stock_quantity: true,
                  },
                },
                images: {
                  columns: {
                    id: true,
                    image_url: true,
                    is_primary: true,
                    imgType: true,
                    product_id: true,
                    variant_id: true,
                  },
                },
              },
            },
          },
        })
        .then((cartItem) => {
          if (!cartItem || cartItem.length === 0) {
            throw new NotFoundException(CartErrorKeyEnum.CART_ITEMS_NOT_FOUND);
          }
          return cartItem;
        })
        .catch((error) => {
          if (
            error instanceof NotFoundException ||
            error instanceof InternalServerErrorException
          ) {
            throw error;
          }
          throw new InternalServerErrorException(
            CartErrorKeyEnum.FAILED_TO_FETCH_CART_ITEM,
            {
              cause: error,
            },
          );
        });
      return cartItems;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        CartErrorKeyEnum.FAILED_TO_FETCH_CART_ITEMS,
        {
          cause: error,
        },
      );
    }
  }

  async findOne(productVariantId: string, customerId: string, domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const [isUserCartExits] = await this.db
        .select({ id: carts.id })
        .from(carts)
        .where(
          and(eq(carts.user_id, customerId), eq(carts.company_id, companyId)),
        );
      const [cartItem] = await this.db
        .select()
        .from(cart_items)
        .where(
          and(
            eq(cart_items.cart_id, isUserCartExits.id),
            eq(cart_items.product_variant_id, productVariantId),
          ),
        )
        .catch((error) => {
          throw new InternalServerErrorException(
            CartErrorKeyEnum.FAILED_TO_FETCH_CART_ITEM,
            {
              cause: error,
            },
          );
        });
      if (!cartItem) {
        throw new NotFoundException(
          `Cart item not found for product variant ID ${productVariantId}`,
        );
      }
      const response = {
        cartId: cartItem.cart_id,
        quantity: cartItem.quantity,
        cartItemId: cartItem.id,
        productVariantId: cartItem.product_variant_id,
      };
      return response;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
    }
  }

  async updateCartItemQuantity(cartId: string, updateCartDto: UpdateCartDto) {
    try {
      await this.db
        .select({
          id: cart_items.id,
          quantity: cart_items.quantity,
          cart_id: cart_items.cart_id,
        })
        .from(cart_items)
        .where(eq(cart_items.id, cartId))
        .then((cartItems) => {
          if (!cartItems || cartItems.length === 0) {
            throw new NotFoundException(
              `Cart item with ID ${cartId} not found`,
            );
          }
        })
        .catch((error) => {
          if (error instanceof NotFoundException) {
            throw error;
          }
          throw new InternalServerErrorException(
            CartErrorKeyEnum.FAILED_TO_UPDATE_CART_ITEM,
            {
              cause: error,
            },
          );
        });
      const updatedCartItem = await this.db
        .update(cart_items)
        .set({ quantity: updateCartDto.quantity })
        .where(
          and(
            eq(cart_items.id, cartId),
            eq(cart_items.cart_id, updateCartDto.cart_items_id),
          ),
        )
        .returning();
      return updatedCartItem;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        CartErrorKeyEnum.FAILED_TO_UPDATE_CART_ITEM,
        {
          cause: error,
        },
      );
    }
  }

  async removeCartItem(
    customerId: string,
    cartId: string,
    cartItemId: string,
    domain: string,
  ) {
    try {
      if (!cartItemId || cartItemId === '') {
        throw new HttpException(
          CartErrorKeyEnum.FAILED_TO_FIND_CART_ITEM,
          HttpStatus.BAD_REQUEST,
        );
      }
      const companyId = await this.resolveCompanyId(domain);
      const [isUserCartExits] = await this.db
        .select({ id: carts.id })
        .from(carts)
        .where(
          and(
            eq(carts.user_id, customerId),
            eq(carts.company_id, companyId),
            eq(carts.id, cartId),
          ),
        )
        .catch((error) => {
          throw new HttpException(
            CartErrorKeyEnum.FAILED_TO_FETCH_USER_CART_INFORMATION,
            HttpStatus.INTERNAL_SERVER_ERROR,
            {
              cause: error,
            },
          );
        });
      if (
        !isUserCartExits ||
        !isUserCartExits.id ||
        isUserCartExits.id === ''
      ) {
        throw new NotFoundException(CartErrorKeyEnum.USER_CART_NOT_FOUND);
      }

      const [cartItemRecord] = await this.db
        .select({ id: cart_items.id, quantity: cart_items.quantity })
        .from(cart_items)
        .where(
          and(eq(cart_items.id, cartItemId), eq(cart_items.cart_id, cartId)),
        )
        .catch((error) => {
          if (error instanceof NotFoundException) {
            throw error;
          }
          throw new InternalServerErrorException(
            CartErrorKeyEnum.FAILED_TO_FIND_CART_ITEM,
            {
              cause: error,
            },
          );
        });

      if (!cartItemRecord) {
        return {
          cart_id: cartId,
          cart_item_id: cartItemId,
          quantity: 0,
          product_variant_id: '',
          success: true,
          message: 'Cart item already deleted or not found',
        };
      }
      return await this.db.transaction(async (tx) => {
        if (cartItemRecord.quantity > 1) {
          const [updatedCartItem] = await tx
            .update(cart_items)
            .set({ quantity: cartItemRecord.quantity - 1 })
            .where(eq(cart_items.id, cartItemId))
            .returning();
          return {
            cart_id: updatedCartItem.cart_id,
            cart_item_id: updatedCartItem.id,
            quantity: updatedCartItem.quantity,
            product_variant_id: updatedCartItem.product_variant_id,
          };
        }
        const deleteResponse = await tx
          .delete(cart_items)
          .where(eq(cart_items.id, cartItemId))
          .catch((error) => {
            if (
              error instanceof NotFoundException ||
              error instanceof InternalServerErrorException
            ) {
              throw error;
            }
            throw new InternalServerErrorException(
              CartErrorKeyEnum.FAILED_TO_DELETE_CART_ITEM,
              {
                cause: error,
              },
            );
          })
          .then((res) => {
            return {
              cartId: cartId,
              // product_variant_id: cartItemRecord.product_variant_id,
              message: `Cart item with ID ${cartItemId} has been deleted successfully`,
              success: true,
            };
          })
          .catch((error) => {
            if (
              error instanceof NotFoundException ||
              error instanceof InternalServerErrorException
            ) {
              throw error;
            }
            throw new InternalServerErrorException(
              CartErrorKeyEnum.FAILED_TO_DELETE_CART_ITEM,
              {
                cause: error,
              },
            );
          });
        return deleteResponse;
      });
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof NotFoundException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        CartErrorKeyEnum.FAILED_TO_DELETE_CART_ITEM,
        {
          cause: error,
        },
      );
    }
  }
  async deleteItemFromCart(cartItemId: string) {
    try {
      await this.db.transaction(async (tx) => {
        const [cartItem] = await tx
          .select({ id: cart_items.id, quantity: cart_items.quantity })
          .from(cart_items)
          .where(eq(cart_items.id, cartItemId));
        if (!cartItem) {
          throw new NotFoundException(
            CartErrorKeyEnum.FAILED_TO_FETCH_CART_ITEM,
          );
        }
        const deleteResponse = await tx
          .delete(cart_items)
          .where(eq(cart_items.id, cartItemId));
        return deleteResponse;
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        CartErrorKeyEnum.FAILED_TO_DELETE_CART_ITEM,
        { cause: error },
      );
    }
  }
}
