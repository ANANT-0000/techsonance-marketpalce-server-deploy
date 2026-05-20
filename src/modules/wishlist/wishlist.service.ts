import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';

import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import {
  product_variants,
  wishlist,
  wishlist_items,
} from '../../drizzle/schema';
import { and, eq, or } from 'drizzle-orm';
import { CompanyService } from '../company/company.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';

@Injectable()
export class WishlistService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
  ) {}

  private async resolveCompanyId(domain: string): Promise<string> {
    console.log(
      `[WishlistService.resolveCompanyId] Resolving company for domain: ${domain}`,
    );
    const filteredDomain = domainExtractor(domain);
    console.log(
      `[WishlistService.resolveCompanyId] Extracted filter domain: ${filteredDomain}`,
    );
    console.log(
      '[WishlistService.resolveCompanyId] Querying CompanyService.find(...)',
    );
    return this.companyService.find(filteredDomain);
  }

  async create(productVariantId: string, customerId: string, domain: string) {
    console.log('[WishlistService.create] Request received', {
      productVariantId,
      customerId,
      domain,
    });
    if (!domain) {
      throw new HttpException(
        'Company domain is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    console.log('[WishlistService.create] Resolving company id');
    const companyId = await this.resolveCompanyId(domain);
    console.log(`[WishlistService.create] Company ID resolved: ${companyId}`);
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
      console.log('[WishlistService.create] Checking existing wishlist');
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
      console.log(
        '[WishlistService.create] Existing wishlist lookup completed',
      );

      console.log('[WishlistService.create] Starting wishlist transaction');
      const response = await this.db.transaction(async (tx) => {
        if (!companyId) {
          throw new HttpException('Company not found', HttpStatus.NOT_FOUND);
        }
        if (wishlistExists && wishlistExists?.id) {
          console.log(
            '[WishlistService.create] Wishlist exists, adding item to existing wishlist',
          );
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
              console.error('Error adding item to wishlist:', error);
              throw new HttpException(
                'Failed to add item to wishlist',
                HttpStatus.INTERNAL_SERVER_ERROR,
              );
            });
          console.log(
            '[WishlistService.create] Wishlist item created for existing wishlist',
            createdWishlistItem,
          );
          return createdWishlistItem;
        }
        console.log('[WishlistService.create] Creating new wishlist record');
        const [wishlistRecord] = await tx
          .insert(wishlist)
          .values({
            company_id: companyId,
            user_id: customerId,
          })
          .returning({ id: wishlist.id });
        console.log(
          '[WishlistService.create] Wishlist record created',
          wishlistRecord,
        );
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
          });
        console.log(
          '[WishlistService.create] Wishlist item created',
          createdWishlistItem,
        );
        return createdWishlistItem;
      });
      console.log(
        '[WishlistService.create] Wishlist transaction completed successfully',
      );
      return response;
    } catch (err) {
      if (err instanceof HttpException) {
        throw new HttpException(
          'Failed to add item to wishlist',
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }
  }

  async findAll(customerId: string, domain: string) {
    console.log('[WishlistService.findAll] Request received', {
      customerId,
      domain,
    });
    if (!domain) {
      throw new HttpException(
        'Company domain is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      console.log('[WishlistService.findAll] Resolving company id');
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        `[WishlistService.findAll] Querying wishlist for company_id: ${companyId}`,
      );
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
      console.log(
        `[WishlistService.findAll] Retrieved ${wishlistData.length} wishlist record(s)`,
      );
      return wishlistData;
    } catch (error) {
      console.error(
        '[WishlistService.findAll] Error fetching wishlist:',
        error,
      );
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
    console.log('[WishlistService.delete] Request received', {
      productVariantId,
      customerId,
      domain,
    });
    if (!domain) {
      throw new HttpException(
        'Company domain is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    console.log('[WishlistService.delete] Resolving company id');
    const companyId = await this.resolveCompanyId(domain);
    try {
      console.log('[WishlistService.delete] Checking wishlist ownership');
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
      console.log(
        '[WishlistService.delete] Checking item existence in wishlist',
      );
      const isExit = await this.db
        .select()
        .from(wishlist_items)
        .where(eq(wishlist_items.product_variant_id, productVariantId));
      console.log('[WishlistService.delete] Deleting wishlist item');
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
        });
      console.log('deleteResponse', deleteResponse);
      return deleteResponse;
    } catch (error) {
      console.error('Error deleting wishlist item:', error);
      throw error;
    }
  }
}
