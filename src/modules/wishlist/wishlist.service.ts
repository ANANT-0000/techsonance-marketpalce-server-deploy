import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module.js';
import {
  product_variants,
  wishlist,
  wishlist_items,
} from '../../drizzle/schema/index.js';
import { and, eq, or } from 'drizzle-orm';
import { CompanyService } from '../company/company.service.js';
import { domainExtractor } from '../../common/filters/domainExtractor.filter.js';
import { WishlistErrorKeyEnum } from './constants/wishlist.enums.js';

@Injectable()
export class WishlistService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
  ) {}

  private async resolveCompanyId(domain: string): Promise<string> {
    const filteredDomain = domainExtractor(domain);
    return this.companyService.find(filteredDomain);
  }

  async create(productVariantId: string, customerId: string, domain: string) {
    if (!domain) {
      throw new HttpException(
        WishlistErrorKeyEnum.COMPANY_DOMAIN_IS_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    const companyId = await this.resolveCompanyId(domain);
    const [variantExists] = await this.db
      .select({ id: product_variants.id })
      .from(product_variants)
      .where(eq(product_variants.id, productVariantId))
      .limit(1)
      .catch((error) => {
        throw new InternalServerErrorException(
          'Failed to check product variant existence',
          {
            cause: error,
          },
        );
      });

    if (!variantExists) {
      throw new HttpException(
        `Product variant "${productVariantId}" not found`,
        HttpStatus.NOT_FOUND,
      );
    }
    try {
      const [wishlistExists] = await this.db
        .select({ id: wishlist.id })
        .from(wishlist)
        .where(eq(wishlist.user_id, customerId))
        .catch((error) => {
          throw new InternalServerErrorException(
            WishlistErrorKeyEnum.FAILED_TO_CHECK_EXISTING_WISHLIST,
            {
              cause: error,
            },
          );
        });

      const response = await this.db
        .transaction(async (tx) => {
          if (!companyId) {
            throw new HttpException(
              WishlistErrorKeyEnum.COMPANY_NOT_FOUND,
              HttpStatus.NOT_FOUND,
            );
          }
          if (wishlistExists && wishlistExists?.id) {
            const [createdWishlistItem] = await tx
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
                throw new InternalServerErrorException(
                  WishlistErrorKeyEnum.FAILED_TO_ADD_ITEM_TO_WISHLIST,
                  {
                    cause: error,
                  },
                );
              });
            return createdWishlistItem;
          }
          const [wishlistRecord] = await tx
            .insert(wishlist)
            .values({
              company_id: companyId,
              user_id: customerId,
            })
            .returning({ id: wishlist.id })
            .catch((error) => {
              throw new InternalServerErrorException(
                WishlistErrorKeyEnum.FAILED_TO_CREATE_WISHLIST,
                {
                  cause: error,
                },
              );
            });
          if (!wishlistRecord) {
            throw new HttpException(
              WishlistErrorKeyEnum.FAILED_TO_CREATE_WISHLIST,
              HttpStatus.INTERNAL_SERVER_ERROR,
            );
          }

          const [createdWishlistItem] = await tx
            .insert(wishlist_items)
            .values({
              wishlist_id: wishlistRecord.id,
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
              throw new InternalServerErrorException(
                WishlistErrorKeyEnum.FAILED_TO_ADD_ITEM_TO_WISHLIST,
                {
                  cause: error,
                },
              );
            });
          return createdWishlistItem;
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            'Failed to complete wishlist creation transaction',
            {
              cause: error,
            },
          );
        });
      return response;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new HttpException(
        WishlistErrorKeyEnum.FAILED_TO_ADD_ITEM_TO_WISHLIST,
        HttpStatus.CONFLICT,
      );
    }
  }

  async findAll(customerId: string, domain: string) {
    if (!domain) {
      throw new HttpException(
        WishlistErrorKeyEnum.COMPANY_DOMAIN_IS_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      const companyId = await this.resolveCompanyId(domain);
      const wishlistData = await this.db.query.wishlist
        .findMany({
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
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            WishlistErrorKeyEnum.FAILED_TO_FETCH_WISHLIST_INFORMATION,
            {
              cause: error,
            },
          );
        });
      return wishlistData;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new HttpException(
        WishlistErrorKeyEnum.FAILED_TO_FETCH_WISHLIST_INFORMATION,
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
        WishlistErrorKeyEnum.COMPANY_DOMAIN_IS_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }

    const companyId = await this.resolveCompanyId(domain);
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
        .limit(1)
        .catch((error) => {
          throw new InternalServerErrorException(
            'Failed to fetch wishlist record for deletion',
            {
              cause: error,
            },
          );
        });
      if (!wishlistRecord) {
        throw new HttpException(
          WishlistErrorKeyEnum.WISHLIST_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }
      const isExit = await this.db
        .select()
        .from(wishlist_items)
        .where(eq(wishlist_items.product_variant_id, productVariantId))
        .catch((error) => {
          throw new InternalServerErrorException(
            'Failed to check if item is in wishlist',
            {
              cause: error,
            },
          );
        });
      const deleteResponse = await this.db
        .delete(wishlist_items)
        .where(
          and(
            eq(wishlist_items.wishlist_id, wishlistRecord.id),
            eq(wishlist_items.product_variant_id, productVariantId),
          ),
        )
        .returning({
          id: wishlist_items.id,
          wishlist_id: wishlist_items.wishlist_id,
          product_variant_id: wishlist_items.product_variant_id,
          created_at: wishlist_items.created_at,
          updated_at: wishlist_items.updated_at,
        })
        .catch((error) => {
          if (error instanceof InternalServerErrorException) {
            throw error;
          }
          throw new InternalServerErrorException(
            'Failed to delete item from wishlist',
            {
              cause: error,
            },
          );
        });
      return deleteResponse;
    } catch (error) {
      throw error;
    }
  }
}
