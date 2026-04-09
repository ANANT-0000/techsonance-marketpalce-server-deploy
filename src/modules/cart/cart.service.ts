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
import { DRIZZLE, type DrizzleService } from 'src/drizzle/drizzle.module';
import {
  cart_items,
  carts,
  company,
  product_variants,
} from 'src/drizzle/schema';
import { and, eq, or, sql } from 'drizzle-orm';

@Injectable()
export class CartService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleService) {}
  async create(
    createCartDto: CreateCartDto,
    customerId: string,
    domain: string,
  ) {
    try {
      const [companyRecord] = await this.db
        .select({ id: company.id })
        .from(company)
        .where(or(eq(company.company_domain, domain), eq(company.id, domain)));
      if (!companyRecord || !companyRecord?.id) {
        throw new HttpException('Company not found', HttpStatus.NOT_FOUND);
      }
      console.log('createCartDto', createCartDto);
      const [isProductVariantExist] = await this.db
        .select({ id: product_variants.id })
        .from(product_variants)
        .where(eq(product_variants.id, createCartDto.productVariantId));
      console.log('isProductVariantExist', isProductVariantExist);
      if (!isProductVariantExist.id || isProductVariantExist.id === '') {
        throw new HttpException(
          'Product variant not found',
          HttpStatus.NOT_FOUND,
        );
      }
      console.log('isProductVariantExist', isProductVariantExist);
      const cartRecord = await this.db.transaction(async (tx) => {
        const [isExitingCart] = await tx
          .select({ id: carts.id, user_id: carts.user_id })
          .from(carts)
          .where(eq(carts.user_id, customerId));
        console.log('isExitingCart', isExitingCart);
        if (isExitingCart && isExitingCart.user_id === customerId) {
          console.log('createCartDto.quantity', createCartDto.quantity);
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
          console.log('createCartItem', createCartItem);
          return {
            cart_id: isExitingCart.id,
            cart_item_id: createCartItem.id,
            quantity: createCartItem.quantity,
            product_variant_id: createCartItem.product_variant_id,
          };
        } else {
          console.log('creating new cart');
          const [createCart] = await tx
            .insert(carts)
            .values({
              company_id: companyRecord.id,
              user_id: customerId,
            })
            .returning({ id: carts.id })
            .catch((error) => {
              throw new InternalServerErrorException('Failed to create cart', {
                cause: error,
              });
            });
          console.log('createCart', createCart);
          const [createCartItem] = await tx
            .insert(cart_items)
            .values({
              cart_id: createCart.id,
              product_variant_id: createCartDto.productVariantId,
              quantity: 1,
            })
            .returning()
            .catch((error) => {
              throw new InternalServerErrorException(
                'Failed to create cart item',
                {
                  cause: error,
                },
              );
            });
          console.log('createCartItem', createCartItem);
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
      console.error('Error creating cart item:', error);
      throw new InternalServerErrorException('Failed to create cart item', {
        cause: error,
      });
    }
  }

  async findAll(customerId: string, domain: string) {
    try {
      console.log('customerId', customerId);
      console.log('domain', domain);
      const [isUserCartExits] = await this.db
        .select({ id: carts.id })
        .from(carts)
        .where(
          and(eq(carts.user_id, customerId), eq(carts.company_id, domain)),
        );
      console.log('isUserCartExits', isUserCartExits);
      if (isUserCartExits === undefined || isUserCartExits.id === '') {
        throw new NotFoundException('User Cart not found');
      }
      const cartItems = await this.db.query.cart_items
        .findMany({
          where: (cart_item) => eq(cart_item.cart_id, isUserCartExits.id),
          with: {
            productVariant: {
              columns: {
                variant_name: true,
                id: true,
                price: true,
                product_id: true,
                sku: true,
                stock_quantity: true,
              },
              with: {
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
            throw new NotFoundException(`Cart items not found `);
          }
          console.log('cart list', cartItem);
          return cartItem;
        })
        .catch((error) => {
          if (
            error instanceof NotFoundException ||
            error instanceof InternalServerErrorException
          ) {
            throw error;
          }
          throw new InternalServerErrorException('Failed to fetch cart item', {
            cause: error,
          });
        });
      console.log('cartItems', cartItems);
      return cartItems;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      console.error('Error fetching cart items:', error);
      throw new InternalServerErrorException('Failed to fetch cart items', {
        cause: error,
      });
    }
  }

  async findOne(productVariantId: string, customerId: string, domain: string) {
    try {
      const [CompanyRecord] = await this.db
        .select({ company_id: company.id })
        .from(company)
        .where(or(eq(company.company_domain, domain), eq(company.id, domain)))
        .limit(1)
        .catch((error) => {
          console.error('Error fetching company:', error);
          throw new HttpException(
            'Failed to fetch company information',
            HttpStatus.INTERNAL_SERVER_ERROR,
            {
              cause: error,
            },
          );
        });
      const [isUserCartExits] = await this.db
        .select({ id: carts.id })
        .from(carts)
        .where(
          and(
            eq(carts.user_id, customerId),
            eq(carts.company_id, CompanyRecord.company_id),
          ),
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
          console.error('Error fetching cart item:', error);
          throw new InternalServerErrorException('Failed to fetch cart item', {
            cause: error,
          });
        });
      if (!cartItem) {
        throw new NotFoundException(
          `Cart item not found for product variant ID ${productVariantId}`,
        );
      }
      console.log('one cart', cartItem);
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
        .select({ id: cart_items.id })
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
          throw new InternalServerErrorException('Failed to update cart item', {
            cause: error,
          });
        });
      const updatedCartItem = await this.db
        .update(cart_items)
        .set({ quantity: updateCartDto.quantity })
        .where(eq(cart_items.id, cartId))
        .returning();
      console.log('updatedCartItem', updatedCartItem);
      return updatedCartItem;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error updating cart item:', error);
      throw new InternalServerErrorException('Failed to update cart item', {
        cause: error,
      });
    }
  }

  async removeCartItem(
    customerId: string,
    cartId: string,
    cartItemId: string,
    domain: string,
  ) {
    try {
      const [companyRecord] = await this.db
        .select({ id: company.id })
        .from(company)
        .where(or(eq(company.company_domain, domain), eq(company.id, domain)))
        .limit(1)
        .catch((error) => {
          console.error('Error fetching company:', error);
          throw new HttpException(
            'Failed to fetch company information',
            HttpStatus.INTERNAL_SERVER_ERROR,
            {
              cause: error,
            },
          );
        });
      const [isUserCartExits] = await this.db
        .select({ id: carts.id })
        .from(carts)
        .where(
          and(
            eq(carts.user_id, customerId),
            eq(carts.company_id, companyRecord.id),
            eq(carts.id, cartId),
          ),
        )
        .catch((error) => {
          console.error('Error fetching user cart:', error);
          throw new HttpException(
            'Failed to fetch user cart information',
            HttpStatus.INTERNAL_SERVER_ERROR,
            {
              cause: error,
            },
          );
        });
      if (!isUserCartExits.id || isUserCartExits.id === '') {
        throw new NotFoundException('User Cart not found');
      }
      console.log('company record', companyRecord.id);
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
          throw new InternalServerErrorException('Failed to find cart item', {
            cause: error,
          });
        });

      console.log('cartItemRecord', cartItemRecord);
      if (!cartItemRecord) {
        throw new NotFoundException(
          `Cart item with ID ${cartItemId} not found`,
        );
      }
      if (cartItemRecord.quantity > 1) {
        const [updatedCartItem] = await this.db
          .update(cart_items)
          .set({ quantity: cartItemRecord.quantity - 1 })
          .where(eq(cart_items.id, cartItemId))
          .returning();
        console.log('updatedCartItem', updatedCartItem);
        return {
          cart_id: updatedCartItem.cart_id,
          cart_item_id: updatedCartItem.id,
          quantity: updatedCartItem.quantity,
          product_variant_id: updatedCartItem.product_variant_id,
        };
      }
      const deleteResponse = await this.db
        .delete(cart_items)
        .where(eq(cart_items.id, cartItemId))
        .catch((error) => {
          if (
            error instanceof NotFoundException ||
            error instanceof InternalServerErrorException
          ) {
            throw error;
          }
          throw new InternalServerErrorException('Failed to delete cart item', {
            cause: error,
          });
        })
        .then((res) => {
          console.log('deleteResponse', res);
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
          console.error('Error deleting cart item:', error);
          throw new InternalServerErrorException('Failed to delete cart item', {
            cause: error,
          });
        });
      console.log('deleteResponse', deleteResponse);
      return deleteResponse;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      console.error('Error deleting cart item:', error);
      throw new InternalServerErrorException('Failed to delete cart item', {
        cause: error,
      });
    }
  }
}
