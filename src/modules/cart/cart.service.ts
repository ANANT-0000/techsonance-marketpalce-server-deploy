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

@Injectable()
export class CartService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
  ) { }
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
      console.log('[CartService.create] Request received', {
        customerId,
        productVariantId: createCartDto.productVariantId,
        quantity: createCartDto.quantity,
      });
      const companyId = await this.resolveCompanyId(domain);
      if (!companyId) {
        console.log('[CartService.create] Company not found for domain', {
          domain,
        });
        throw new HttpException('Company not found', HttpStatus.NOT_FOUND);
      }
      console.log('[CartService.create] Validating product variant');
      const [isProductVariantExist] = await this.db
        .select({ id: product_variants.id })
        .from(product_variants)
        .where(eq(product_variants.id, createCartDto.productVariantId));
      console.log(
        '[CartService.create] Product variant existence check completed',
      );
      if (!isProductVariantExist.id || isProductVariantExist.id === '') {
        console.log('[CartService.create] Product variant not found', {
          productVariantId: createCartDto.productVariantId,
        });
        throw new HttpException(
          'Product variant not found',
          HttpStatus.NOT_FOUND,
        );
      }
      console.log(
        '[CartService.create] Starting database transaction to create/update cart',
      );
      const cartRecord = await this.db.transaction(async (tx) => {
        const [isExitingCart] = await tx
          .select({ id: carts.id, user_id: carts.user_id })
          .from(carts)
          .where(eq(carts.user_id, customerId));
        console.log('[CartService.create] Existing cart check completed');
        if (isExitingCart && isExitingCart.user_id === customerId) {
          console.log('[CartService.create] Adding item to existing cart', {
            cartId: isExitingCart.id,
          });
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
          console.log(
            '[CartService.create] Cart item added/updated successfully',
          );
          return {
            cart_id: isExitingCart.id,
            cart_item_id: createCartItem.id,
            quantity: createCartItem.quantity,
            product_variant_id: createCartItem.product_variant_id,
          };
        } else {
          console.log('[CartService.create] Creating new cart for user');
          const [createCart] = await tx
            .insert(carts)
            .values({
              company_id: companyId,
              user_id: customerId,
            })
            .returning({ id: carts.id })
            .catch((error) => {
              console.error('[CartService.create] Error creating cart:', error);
              throw new InternalServerErrorException('Failed to create cart', {
                cause: error,
              });
            });
          console.log(
            '[CartService.create] Cart created successfully, now creating cart item',
          );
          const [createCartItem] = await tx
            .insert(cart_items)
            .values({
              cart_id: createCart.id,
              product_variant_id: createCartDto.productVariantId,
              quantity: 1,
            })
            .returning()
            .catch((error) => {
              console.error(
                '[CartService.create] Error creating cart item:',
                error,
              );
              throw new InternalServerErrorException(
                'Failed to create cart item',
                {
                  cause: error,
                },
              );
            });
          console.log('[CartService.create] Cart item created successfully');
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

  async findAll(
    customerId: string,
    domain: string,
    filters: { limit: number, offset: number },
  ) {
    try {
      console.log('[CartService.findAll] Request received', { customerId });
      const companyId = await this.resolveCompanyId(domain);
      console.log('[CartService.findAll] Checking for existing cart');
      const [isUserCartExits] = await this.db
        .select({ id: carts.id })
        .from(carts)
        .where(
          and(eq(carts.user_id, customerId), eq(carts.company_id, companyId)),
        );
      console.log('[CartService.findAll] Cart existence check completed');
      if (isUserCartExits === undefined || isUserCartExits.id === '') {
        console.log('[CartService.findAll] User cart not found');
        throw new NotFoundException('User Cart not found');
      }
      console.log(
        '[CartService.findAll] Fetching cart items with product details',
      );
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
            console.log('[CartService.findAll] No cart items found');
            throw new NotFoundException(`Cart items not found `);
          }
          console.log(
            '[CartService.findAll] Cart items retrieved successfully',
            { itemCount: cartItem.length },
          );
          return cartItem;
        })
        .catch((error) => {
          if (
            error instanceof NotFoundException ||
            error instanceof InternalServerErrorException
          ) {
            throw error;
          }
          console.error(
            '[CartService.findAll] Error fetching cart items:',
            error,
          );
          throw new InternalServerErrorException('Failed to fetch cart item', {
            cause: error,
          });
        });
      return cartItems;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      console.error('[CartService.findAll] Error in findAll:', error);
      throw new InternalServerErrorException('Failed to fetch cart items', {
        cause: error,
      });
    }
  }

  async findOne(productVariantId: string, customerId: string, domain: string) {
    try {
      console.log('[CartService.findOne] Request received', {
        customerId,
        productVariantId,
      });
      const companyId = await this.resolveCompanyId(domain);
      console.log('[CartService.findOne] Checking for existing cart');
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
          console.error(
            '[CartService.findOne] Error fetching cart item:',
            error,
          );
          throw new InternalServerErrorException('Failed to fetch cart item', {
            cause: error,
          });
        });
      if (!cartItem) {
        console.log('[CartService.findOne] Cart item not found');
        throw new NotFoundException(
          `Cart item not found for product variant ID ${productVariantId}`,
        );
      }
      console.log('[CartService.findOne] Cart item found successfully');
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
      console.log('[CartService.updateCartItemQuantity] Request received', {
        cartId,
        newQuantity: updateCartDto.quantity,
      });
      console.log(
        '[CartService.updateCartItemQuantity] Validating cart item exists',
      );
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
            console.log(
              '[CartService.updateCartItemQuantity] Cart item not found',
            );
            throw new NotFoundException(
              `Cart item with ID ${cartId} not found`,
            );
          }
          console.log(
            '[CartService.updateCartItemQuantity] Cart item validation successful',
          );
        })
        .catch((error) => {
          if (error instanceof NotFoundException) {
            throw error;
          }
          console.error(
            '[CartService.updateCartItemQuantity] Error validating cart item:',
            error,
          );
          throw new InternalServerErrorException('Failed to update cart item', {
            cause: error,
          });
        });
      console.log(
        '[CartService.updateCartItemQuantity] Updating cart item quantity in database',
      );
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
      console.log(
        '[CartService.updateCartItemQuantity] Cart item quantity updated successfully',
      );
      return updatedCartItem;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error(
        '[CartService.updateCartItemQuantity] Error updating cart:',
        error,
      );
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
      console.log('[CartService.removeCartItem] Request received', {
        customerId,
        cartId,
        cartItemId,
      });
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

      console.log('company record', companyId);
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
      return await this.db.transaction(async (tx) => {
        if (cartItemRecord.quantity > 1) {
          const [updatedCartItem] = await tx
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
              'Failed to delete cart item',
              {
                cause: error,
              },
            );
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
            throw new InternalServerErrorException(
              'Failed to delete cart item',
              {
                cause: error,
              },
            );
          });
        console.log('deleteResponse', deleteResponse);
        return deleteResponse;
      });
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
