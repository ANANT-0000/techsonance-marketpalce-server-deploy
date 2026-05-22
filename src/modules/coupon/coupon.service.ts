import { user } from './../../drizzle/schema/users.schema';
import { coupon_products } from './../../drizzle/schema/shop.schema';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import { and, count, desc, eq, gte, isNull, or } from 'drizzle-orm';
import { coupon_usage, coupons } from '../../drizzle/schema';
import { CompanyService } from '../company/company.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { CreateCouponDto, UpdateCouponDto } from './dto/coupon.dto';

@Injectable()
export class CouponService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
  ) {}

  private async resolveCompanyId(domain: string): Promise<string> {
    const filteredDomain = domainExtractor(domain);
    return this.companyService.find(filteredDomain);
  }

  async verifyCoupon(code: string, userId: string, domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);

      console.log('coupon verifying');
      const couponRecord = await this.db
        .select()
        .from(coupons)
        .where(
          and(
            eq(coupons.code, code),
            eq(coupons.company_id, companyId),
            eq(coupons.is_active, true),
          ),
        )
        .limit(1)
        .catch((error) => {
          console.error('Error loading coupon record:', error);
          throw new InternalServerErrorException('Failed to load coupon', {
            cause: error,
          });
        });
      if (couponRecord.length === 0) {
        return { valid: false, message: 'Invalid coupon code' };
      }
      const isUsed = await this.db
        .select()
        .from(coupon_usage)
        .where(
          and(
            eq(coupon_usage.coupon_id, couponRecord[0].id),
            eq(coupon_usage.user_id, userId),
          ),
        )
        .limit(1)
        .catch((error) => {
          console.error('Error loading coupon usage:', error);
          throw new InternalServerErrorException(
            'Failed to load coupon usage',
            {
              cause: error,
            },
          );
        });
      if (isUsed.length > 0) {
        return { valid: false, message: 'Coupon already used' };
      }
    } catch (error) {
      console.error('Error verifying coupon:', error);
      throw new InternalServerErrorException('Failed to verify coupon', {
        cause: error,
      });
    }
  }
  async validateAppliedCoupon(
    userId: string,
    code: string,
    cartTotal: number,
    currentProductIds: string[],
  ) {
    // 1. Fetch the coupon and its linked products
    try {
      const coupon = await this.db.query.coupons
        .findFirst({
          where: and(
            eq(coupons.code, code.toUpperCase()),
            eq(coupons.is_active, true),
          ),
          with: {
            products: true,
          },
        })
        .catch((error) => {
          console.error('Error fetching coupon for validation:', error);
          throw new InternalServerErrorException('Failed to fetch coupon', {
            cause: error,
          });
        });

      // 2. Existence Check
      if (!coupon) {
        throw new NotFoundException('Invalid or inactive promo code.');
      }
      const [usageCount] = await this.db
        .select({ id: count() })
        .from(coupon_usage)
        .where(
          and(
            eq(coupon_usage.coupon_id, coupon.id),
            eq(coupon_usage.user_id, userId),
          ),
        )
        .catch((error) => {
          console.error('Error counting coupon usage:', error);
          throw new InternalServerErrorException('Failed to validate coupon', {
            cause: error,
          });
        });
      if (
        coupon.max_uses_per_user &&
        usageCount.id >= coupon.max_uses_per_user
      ) {
        throw new BadRequestException(
          'You have already used this coupon the maximum number of times allowed.',
        );
      }
      // 3. Date Checks
      const now = new Date();
      if (coupon.valid_from && new Date(coupon.valid_from) > now) {
        throw new BadRequestException('This offer is not yet active.');
      }
      if (coupon.valid_to && new Date(coupon.valid_to) < now) {
        throw new BadRequestException('This offer has expired.');
      }

      // 4. Minimum Spend Check
      if (
        coupon.min_order_amount &&
        cartTotal < Number(coupon.min_order_amount)
      ) {
        throw new BadRequestException(
          `Add ₹${Number(coupon?.min_order_amount) - cartTotal} more to unlock this offer.`,
        );
      }

      // 5. Product Applicability Check
      // If the junction table is empty, this coupon applies to the whole store.
      const isGlobalCoupon = coupon.products.length === 0;

      let validForProductIds: string[] = [];

      if (isGlobalCoupon) {
        // It's global, so it applies to everything currently in the cart/page
        validForProductIds = currentProductIds;
      } else {
        // It is restricted. Extract the IDs this coupon is allowed to be used on.
        const allowedProductIds = coupon.products.map((product) => product.id);

        // Find the intersection: which products in the cart are actually allowed?
        validForProductIds = currentProductIds.filter((id) =>
          allowedProductIds.includes(id),
        );

        // If none of the products in the cart are allowed, reject it.
        if (validForProductIds.length === 0) {
          throw new BadRequestException(
            'This coupon is not applicable to the selected product(s).',
          );
        }
      }

      // 6. Return Success with the filtered IDs
      const result = {
        id: coupon.id,
        code: coupon.code,
        discount_type: coupon.discount_type,
        discount_value: Number(coupon.discount_value),
        max_discount_amount: coupon.max_discount_amount
          ? Number(coupon.max_discount_amount)
          : null,
        isGlobal: isGlobalCoupon,
        applicableProductIds: validForProductIds,
      };
      console.log('result ', result);
      return result;
    } catch (error) {
      console.error('Error validating applied coupon:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to validate coupon', {
        cause: error,
      });
    }
  }
  async create(dto: CreateCouponDto, domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      if (!companyId) {
        throw new InternalServerErrorException(
          `Company with domain ${domain} not found`,
        );
      }
      return await this.db.transaction(async (tx) => {
        if (!dto.is_auto_applied && dto.code) {
          const [existingCoupon] = await tx
            .select({ id: coupons.id })
            .from(coupons)
            .where(
              and(
                eq(coupons.company_id, companyId),
                eq(coupons.code, dto.code.toUpperCase()),
              ),
            )
            .catch((error) => {
              console.error(
                'Error checking coupon existence during create:',
                error,
              );
              throw new InternalServerErrorException(
                'Failed to check coupon existence',
                {
                  cause: error,
                },
              );
            });

          if (existingCoupon && existingCoupon.id) {
            console.log(existingCoupon);
            throw new HttpException(
              `Coupon code ${dto.code} already exists for this company.`,
              HttpStatus.BAD_REQUEST,
            );
          }
        }
        const [newCoupon] = await tx
          .insert(coupons)
          .values({
            code: dto.code.toUpperCase(),
            description: dto.description || null,
            discount_type: dto.discount_type,
            discount_value: dto.discount_value.toString(),
            min_order_amount: dto.min_order_amount?.toString(),
            max_discount_amount: dto.max_discount_amount?.toString(),
            max_uses: dto.max_uses || null,
            max_uses_per_user: dto.max_uses_per_user ?? 1,
            total_used: 0,
            is_auto_applied: dto.is_auto_applied ?? false,
            is_active: dto.is_active ?? true,
            valid_from: new Date(dto.valid_from),
            valid_to: new Date(dto.valid_to),
            company_id: companyId,
          })
          .returning()
          .catch((error) => {
            console.error('Error inserting coupon:', error);
            throw new InternalServerErrorException('Failed to insert coupon', {
              cause: error,
            });
          });
        if (
          dto.applicable_product_ids &&
          dto.applicable_product_ids.length > 0
        ) {
          const productLinks = dto.applicable_product_ids.map((productId) => ({
            coupon_id: newCoupon.id,
            product_id: productId,
          }));
          await tx
            .insert(coupon_products)
            .values(productLinks)
            .catch((error) => {
              console.error('Error linking coupon products:', error);
              throw new InternalServerErrorException(
                'Failed to link coupon products',
                {
                  cause: error,
                },
              );
            });
        }

        return newCoupon;
      });
    } catch (error) {
      console.error('Error creating coupon:', error);
      if (
        error instanceof InternalServerErrorException ||
        error instanceof NotFoundException
      ) {
        throw new InternalServerErrorException(
          `Failed to create coupon: ${error.message}`,
          { cause: error },
        );
      }
      throw new InternalServerErrorException('Failed to create coupon', {
        cause: error,
      });
    }
  }

  async findAll(domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      console.log('coupon findAll', Date.now());
      return await this.db
        .select()
        .from(coupons)
        .where(eq(coupons.company_id, companyId))
        .orderBy(desc(coupons.created_at))
        .catch((error) => {
          console.error('Error loading coupons:', error);
          throw new InternalServerErrorException('Failed to load coupons', {
            cause: error,
          });
        });
    } catch (error) {
      console.error('Error fetching coupons:', error);
      throw new InternalServerErrorException('Failed to fetch coupons', {
        cause: error,
      });
    }
  }

  async findCoupons(domain: string, productId?: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      console.log('coupon findCoupons', { productId, companyId });

      const cleanProductId =
        productId === 'null' || productId === 'undefined' || !productId
          ? undefined
          : productId;
      console.log('cleanProductId', cleanProductId);
      // --- 2. DYNAMIC APPLICABILITY RULE ---
      // Use the cleaned variable here!
      const applicabilityRule = cleanProductId
        ? or(
            eq(coupon_products.product_id, cleanProductId),
            isNull(coupon_products.coupon_id),
          )
        : isNull(coupon_products.coupon_id);
      console.log('applicabilityRule', applicabilityRule);
      const validCoupons = await this.db
        .select({
          id: coupons.id,
          code: coupons.code,
          description: coupons.description,
          discount_type: coupons.discount_type,
          discount_value: coupons.discount_value,
          min_order_amount: coupons.min_order_amount,
          max_discount_amount: coupons.max_discount_amount,
          valid_from: coupons.valid_from,
          valid_to: coupons.valid_to,
        })
        .from(coupons)
        .leftJoin(coupon_products, eq(coupons.id, coupon_products.coupon_id))
        .where(
          and(
            eq(coupons.company_id, companyId),
            eq(coupons.is_active, true),
            gte(coupons.valid_to, new Date()),

            // Inject the dynamic rule here!
            applicabilityRule,
          ),
        )
        .groupBy(coupons.id)
        .catch((error) => {
          console.error('Error executing Drizzle query for coupons:', error);
          throw new InternalServerErrorException(
            'Database error while loading coupons',
          );
        });

      return validCoupons;
    } catch (error) {
      console.error('Error fetching coupons for product:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to fetch coupons', {
        cause: error,
      });
    }
  }
  async findOne(id: string, domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      console.log('coupon findOne', { couponId: id });
      const [coupon] = await this.db
        .select()
        .from(coupons)
        .where(and(eq(coupons.id, id), eq(coupons.company_id, companyId)))
        .limit(1)
        .catch((error) => {
          console.error('Error loading coupon by id:', error);
          throw new InternalServerErrorException('Failed to load coupon', {
            cause: error,
          });
        });

      if (!coupon) throw new NotFoundException('Coupon not found');
      return coupon;
    } catch (error) {
      console.error('Error fetching coupon:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to fetch coupon', {
        cause: error,
      });
    }
  }
  async checkExistingWithId(id: string) {
    try {
      const [existingCoupon] = await this.db
        .select({ id: coupons.id })
        .from(coupons)
        .where(eq(coupons.id, id))
        .limit(1)
        .catch((error) => {
          console.error('Error checking existing coupon:', error);
          throw new InternalServerErrorException('Failed to check coupon', {
            cause: error,
          });
        });
      return existingCoupon;
    } catch (error) {
      console.error('Error in checkExistingWithId:', error);
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to check coupon', {
        cause: error,
      });
    }
  }
  async checkExistingCode(code: string) {
    try {
      const [existingCoupon] = await this.db
        .select({ id: coupons.id })
        .from(coupons)
        .where(eq(coupons.code, code.toUpperCase()))
        .limit(1)
        .catch((error) => {
          console.error('Error checking existing coupon:', error);
          throw new InternalServerErrorException('Failed to check coupon', {
            cause: error,
          });
        });
      return existingCoupon;
    } catch (error) {
      console.error('Error in checkExistingCode:', error);
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to check coupon', {
        cause: error,
      });
    }
  }
  async update(id: string, updateCouponDto: UpdateCouponDto, domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      console.log('coupon update', { couponId: id });

      const existingCoupon = await this.checkExistingWithId(id);
      console.log('existing coupon', existingCoupon);
      if (!existingCoupon) {
        throw new HttpException('Coupon not found', HttpStatus.NOT_FOUND);
      }

      const [updatedCoupon] = await this.db
        .update(coupons)
        .set({
          ...updateCouponDto,
          // Convert numbers to strings for Drizzle decimal types if provided
          discount_value: updateCouponDto.discount_value?.toString(),
          min_order_amount: updateCouponDto.min_order_amount?.toString(),
          max_discount_amount: updateCouponDto.max_discount_amount?.toString(),
          valid_from: updateCouponDto.valid_from
            ? new Date(updateCouponDto.valid_from)
            : undefined,
          valid_to: updateCouponDto.valid_to
            ? new Date(updateCouponDto.valid_to)
            : undefined,
        })
        .where(and(eq(coupons.id, id), eq(coupons.company_id, companyId)))
        .returning()
        .catch((error) => {
          console.error('Error updating coupon in database:', error);
          throw new InternalServerErrorException('Failed to update coupon', {
            cause: error,
          });
        });

      return updatedCoupon;
    } catch (error) {
      console.error('Error updating coupon:', error);
      if (
        error instanceof HttpException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update coupon', {
        cause: error,
      });
    }
  }

  async remove(id: string, domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      console.log('coupon remove', { couponId: id });
      const existingCoupon = await this.checkExistingWithId(id); // Verify existence
      if (!existingCoupon) {
        throw new HttpException('Coupon not found', HttpStatus.NOT_FOUND);
      }
      // It is usually better to SOFT DELETE coupons so historical order data doesn't break
      const [deleted] = await this.db
        .update(coupons)
        .set({ is_active: false })
        .where(and(eq(coupons.id, id), eq(coupons.company_id, companyId)))
        .returning()
        .catch((error) => {
          console.error('Error deactivating coupon in database:', error);
          throw new InternalServerErrorException('Failed to remove coupon', {
            cause: error,
          });
        });

      return { message: 'Coupon deactivated successfully', coupon: deleted };
    } catch (error) {
      console.error('Error removing coupon:', error);
      if (
        error instanceof HttpException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to remove coupon', {
        cause: error,
      });
    }
  }
}
