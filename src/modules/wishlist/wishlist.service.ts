import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';

import { DRIZZLE, type DrizzleService } from 'src/drizzle/drizzle.module';
import {
  company,
  product_variants,
  wishlist,
  wishlist_items,
} from 'src/drizzle/schema';
import { and, eq, or } from 'drizzle-orm';
import { CompanyService } from '../company/company.service';

@Injectable()
export class WishlistService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
  ) {}
  async create(productVariantId: string, customerId: string, domain: string) {
    if (!domain) {
      throw new HttpException(
        'Company domain is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    console.log('productVariantId', productVariantId);
    console.log('customerId', customerId);
    const companyId = await this.companyService.find(domain);
    const [variantExists] = await this.db
      .select({ id: product_variants.id })
      .from(product_variants)
      .where(eq(product_variants.id, productVariantId))
      .limit(1);

    if (!variantExists) {
      throw new HttpException(
        `Product variant "${productVariantId}" not found`,
        HttpStatus.NOT_FOUND,
      );
    }
    try {
      console.log('Creating wishlist for customer:', customerId);
      console.log('Wishlist data:', productVariantId);
      console.log('Company domain:', domain);
      const [wishlistExists] = await this.db
        .select({ id: wishlist.id })
        .from(wishlist)
        .where(eq(wishlist.user_id, customerId))
        .catch((error) => {
          console.error('Error checking existing wishlist:', error);
          throw new HttpException(
            'Failed to check existing wishlist',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        });
      console.log('wishlistExists', wishlistExists);

      const response = await this.db.transaction(async (tx) => {
        if (!companyId) {
          throw new HttpException('Company not found', HttpStatus.NOT_FOUND);
        }
        console.log(wishlistExists);
        if (wishlistExists && wishlistExists?.id) {
          console.log('Wishlist already exists for customer:', customerId);
          console.log('adding item in wishlist');
          const createdWishlistItem = await tx
            .insert(wishlist_items)
            .values({
              wishlist_id: wishlistExists.id,
              product_variant_id: productVariantId,
            })
            .onConflictDoUpdate({
              target: [
                wishlist_items.wishlist_id,
                wishlist_items.product_variant_id,
              ],
              set: {
                updated_at: new Date(),
              },
            })
            .returning({
              id: wishlist_items.id,
              wishlist_id: wishlist_items.wishlist_id,
              product_variant_id: wishlist_items.product_variant_id,
              created_at: wishlist_items.created_at,
              updated_at: wishlist_items.updated_at,
            })
            .catch((error) => {
              console.error('Error adding item to wishlist:', error);
              throw new HttpException(
                'Failed to add item to wishlist',
                HttpStatus.INTERNAL_SERVER_ERROR,
              );
            });
          console.log(
            'Wishlist item created for existing wishlist:',
            createdWishlistItem,
          );
          return createdWishlistItem;
        }
        const [wishlistRecord] = await tx
          .insert(wishlist)
          .values({
            company_id: companyId,
            user_id: customerId,
          })
          .returning({ id: wishlist.id });
        console.log('Wishlist record created:', wishlistRecord);
        if (!wishlistRecord) {
          throw new HttpException(
            'Failed to create wishlist',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }

        const [createdWishlistItem] = await tx
          .insert(wishlist_items)
          .values({
            wishlist_id: wishlistRecord.id,
            product_variant_id: productVariantId,
          })
          .onConflictDoNothing({
            target: [
              wishlist_items.wishlist_id,
              wishlist_items.product_variant_id,
            ],
          })
          .returning({
            id: wishlist_items.id,
            wishlist_id: wishlist_items.wishlist_id,
            product_variant_id: wishlist_items.product_variant_id,
            created_at: wishlist_items.created_at,
            updated_at: wishlist_items.updated_at,
          });
        if (createdWishlistItem === undefined) {
          throw new HttpException(
            'Wishlist item already exists',
            HttpStatus.BAD_REQUEST,
          );
        }
        console.log('Wishlist item created:', createdWishlistItem);
        return createdWishlistItem;
      });
      return response;
    } catch (error) {
      console.error('Error creating wishlist:', error);
      throw error;
    }
  }

  async findAll(customerId: string, domain: string) {
    if (!domain) {
      throw new HttpException(
        'Company domain is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      const companyId = await this.companyService.find(domain);
      const wishlistData = await this.db.query.wishlist.findMany({
        where: and(
          eq(wishlist.user_id, customerId),
          eq(wishlist.company_id, companyId),
        ),
        with: {
          items: {
            with: {
              productVariant: {
                with: {
                  images: true,
                },
              },
            },
          },
        },
      });
      console.log('Wishlist data fetched:', wishlistData);
      return wishlistData;
    } catch (error) {
      console.error('Error fetching wishlist:', error);
      throw new HttpException(
        'Failed to fetch wishlist information',
        HttpStatus.INTERNAL_SERVER_ERROR,
        {
          cause: error,
        },
      );
    }
  }

  findOne(id: string) {
    return `This action returns a #${id} wishlist`;
  }

  // update(id: string, updateWishlistDto: UpdateWishlistDto) {
  //   return `This action updates a #${id} wishlist`;
  // }

  async delete(productVariantId: string, customerId: string, domain: string) {
    if (!domain) {
      throw new HttpException(
        'Company domain is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const companyId = await this.companyService.find(domain);
    try {
      const [wishlistRecord] = await this.db
        .select({ id: wishlist.id })
        .from(wishlist)
        .where(
          and(
            eq(wishlist.user_id, customerId),
            eq(wishlist.company_id, companyId),
          ),
        )
        .limit(1);
      if (!wishlistRecord) {
        throw new HttpException('Wishlist not found', HttpStatus.NOT_FOUND);
      }
      console.log('productVariantId', productVariantId);
      const isExit = await this.db
        .select()
        .from(wishlist_items)
        .where(eq(wishlist_items.product_variant_id, productVariantId));
      console.log('Exit', isExit);
      const deleteResponse = await this.db
        .delete(wishlist_items)
        .where(
          and(
            eq(wishlist_items.wishlist_id, wishlistRecord.id),
            eq(wishlist_items.product_variant_id, productVariantId),
          ),
        );
      console.log('deleteResponse', deleteResponse);
    } catch (error) {
      console.error('Error deleting wishlist item:', error);
      throw error;
    }
  }
}
