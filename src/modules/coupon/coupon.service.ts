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
import {
  coupons,
  promotions,
  promotion_rules,
  promotion_targets,
  promotion_usage,
  user,
} from '../../drizzle/schema';
import { CompanyService } from '../company/company.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { CreateCouponDto, UpdateCouponDto } from './dto/coupon.dto';
import { PromotionStatus, PromotionType } from 'src/drizzle/types/types';

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

      const [promoData] = await this.db
        .select({ promoId: promotions.id })
        .from(promotions)
        .innerJoin(coupons, eq(promotions.coupon_id, coupons.id))
        .where(
          and(
            eq(coupons.code, code.toUpperCase()),
            eq(promotions.company_id, companyId),
            eq(promotions.status, PromotionStatus.ACTIVE),
          ),
        )
        .limit(1);

      if (!promoData) {
        return { valid: false, message: 'Invalid or inactive coupon code' };
      }

      const isUsed = await this.db
        .select()
        .from(promotion_usage)
        .where(
          and(
            eq(promotion_usage.promotion_id, promoData.promoId),
            eq(promotion_usage.user_id, userId),
          ),
        )
        .limit(1);

      if (isUsed.length > 0) {
        return { valid: false, message: 'Coupon already used' };
      }

      return { valid: true, message: 'Coupon is valid' };
    } catch (error) {
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
    try {
      // 1. Fetch the unified promotion and its targets/rules
      const couponPromotion = await this.db.query.promotions.findFirst({
        where: and(eq(promotions.status, PromotionStatus.ACTIVE)),
        with: {
          coupon: true,
          rules: true,
          targets: true,
        },
      });

      // Match explicit code
      if (
        !couponPromotion ||
        couponPromotion.coupon?.code !== code.toUpperCase()
      ) {
        throw new NotFoundException('Invalid or inactive promo code.');
      }

      // 2. Usage Limits
      const [usageCount] = await this.db
        .select({ id: count() })
        .from(promotion_usage)
        .where(
          and(
            eq(promotion_usage.promotion_id, couponPromotion.id),
            eq(promotion_usage.user_id, userId),
          ),
        );

      if (
        couponPromotion.max_uses_per_user &&
        usageCount.id >= couponPromotion.max_uses_per_user
      ) {
        throw new BadRequestException(
          'You have already used this coupon the maximum number of times allowed.',
        );
      }

      // 3. Date Checks
      const now = new Date();
      if (
        couponPromotion.valid_from &&
        new Date(couponPromotion.valid_from) > now
      ) {
        throw new BadRequestException('This offer is not yet active.');
      }
      if (
        couponPromotion.valid_to &&
        new Date(couponPromotion.valid_to) < now
      ) {
        throw new BadRequestException('This offer has expired.');
      }

      // 4. Minimum Spend Check (from Rules Engine)
      const minCartRule = couponPromotion.rules.find(
        (r) => r.rule_type === 'min_cart_value',
      );
      if (minCartRule) {
        const requiredAmount = (minCartRule.rule_config as any).amount;
        if (cartTotal < Number(requiredAmount)) {
          throw new BadRequestException(
            `Add ₹${Number(requiredAmount) - cartTotal} more to unlock this offer.`,
          );
        }
      }

      // 5. Product Applicability Check (from Targets Engine)
      const isGlobalCoupon = couponPromotion.targets.length === 0;
      let validForProductIds: string[] = [];

      if (isGlobalCoupon) {
        validForProductIds = currentProductIds;
      } else {
        const allowedProductIds = couponPromotion.targets
          .filter((t) => t.target_type === 'product' && !t.exclude)
          .map((t) => t.target_id);

        validForProductIds = currentProductIds.filter((id) =>
          allowedProductIds.includes(id),
        );

        if (validForProductIds.length === 0) {
          throw new BadRequestException(
            'This coupon is not applicable to the selected product(s).',
          );
        }
      }

      const discountConfig: any = couponPromotion.discount_config;

      return {
        id: couponPromotion.coupon_id, // Returning Coupon ID for backwards compatibility
        promotion_id: couponPromotion.id,
        code: couponPromotion.coupon.code,
        discount_type: couponPromotion.promotion_type,
        discount_value: Number(discountConfig.value || 0),
        max_discount_amount: discountConfig.cap
          ? Number(discountConfig.cap)
          : null,
        isGlobal: isGlobalCoupon,
        applicableProductIds: validForProductIds,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Failed to validate coupon', {
        cause: error,
      });
    }
  }

  async create(dto: CreateCouponDto, domain: string, userId: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const [isUserExist] = await this.db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);
      if (!isUserExist.id) {
        throw new HttpException('User not found.', HttpStatus.NOT_FOUND);
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
            );

          if (existingCoupon) {
            throw new HttpException(
              `Coupon code ${dto.code} already exists.`,
              HttpStatus.BAD_REQUEST,
            );
          }
        }

        // 1. Insert Base Lookup Code
        const [newCoupon] = await tx
          .insert(coupons)
          .values({
            code: dto.code.toUpperCase(),
            description: dto.description || null,
            is_active: dto.is_active ?? true,
            company_id: companyId,
          })
          .returning();

        // 2. Setup Config Strategy Pattern
        let discountConfig: any = {};
        let promoType = PromotionType.FIXED_AMOUNT;

        //@ts-expect-error
        if (dto.discount_type === PromotionType.PERCENTAGE) {
          promoType = PromotionType.PERCENTAGE;
          discountConfig = {
            value: Number(dto.discount_value),
            cap: dto.max_discount_amount
              ? Number(dto.max_discount_amount)
              : null,
          };
          //@ts-expect-error
        } else if (dto.discount_type === PromotionType.FREE_SHIPPING) {
          promoType = PromotionType.FREE_SHIPPING;
          discountConfig = { max_shipping_waived: Number(dto.discount_value) };
        } else {
          discountConfig = { value: Number(dto.discount_value) };
        }

        // 3. Insert Unified Promotion
        const [newPromotion] = await tx
          .insert(promotions)
          .values({
            company_id: companyId,
            created_by: userId,
            name: `Coupon - ${dto.code.toUpperCase()}`,
            description: dto.description || null,
            promotion_type: promoType as PromotionType,
            discount_config: discountConfig,
            coupon_id: newCoupon.id,
            is_auto_applied: dto.is_auto_applied ?? false,
            status: dto.is_active
              ? PromotionStatus.ACTIVE
              : PromotionStatus.DRAFT,
            valid_from: new Date(dto.valid_from),
            valid_to: new Date(dto.valid_to),
            max_uses_total: dto.max_uses || null,
            max_uses_per_user: dto.max_uses_per_user ?? 1,
          })
          .returning();

        // 4. Attach Min Cart Rule (if exists)
        if (dto.min_order_amount) {
          await tx.insert(promotion_rules).values({
            promotion_id: newPromotion.id,
            rule_type: 'min_cart_value' as any,
            rule_config: { amount: Number(dto.min_order_amount) },
          });
        }

        // 5. Attach Product Targets (if restricted)
        if (
          dto.applicable_product_ids &&
          dto.applicable_product_ids.length > 0
        ) {
          const targets = dto.applicable_product_ids.map((id) => ({
            promotion_id: newPromotion.id,
            target_type: 'product' as any,
            target_id: id,
            exclude: false,
          }));
          await tx.insert(promotion_targets).values(targets);
        }

        return { ...newCoupon, promotion_id: newPromotion.id };
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Failed to create coupon', {
        cause: error,
      });
    }
  }

  async findAll(domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);

      const results = await this.db
        .select({
          id: coupons.id,
          code: coupons.code,
          description: coupons.description,
          is_active: coupons.is_active,
          created_at: coupons.created_at,
          promo_id: promotions.id,
          promotion_type: promotions.promotion_type,
          discount_config: promotions.discount_config,
          valid_from: promotions.valid_from,
          valid_to: promotions.valid_to,
          max_uses_total: promotions.max_uses_total,
          max_uses_per_user: promotions.max_uses_per_user,
        })
        .from(coupons)
        .innerJoin(promotions, eq(promotions.coupon_id, coupons.id))
        .where(eq(coupons.company_id, companyId))
        .orderBy(desc(coupons.created_at));

      // Reconstruct UI Payload Expectation
      return results.map((row) => {
        const config = row.discount_config as any;
        return {
          id: row.id,
          code: row.code,
          description: row.description,
          is_active: row.is_active,
          created_at: row.created_at,
          discount_type:
            row.promotion_type === 'percentage_off'
              ? 'percentage'
              : 'fixed_cart',
          discount_value: config?.value || 0,
          max_discount_amount: config?.cap || null,
          valid_from: row.valid_from,
          valid_to: row.valid_to,
          max_uses: row.max_uses_total,
          max_uses_per_user: row.max_uses_per_user,
        };
      });
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch coupons', {
        cause: error,
      });
    }
  }

  async findCoupons(domain: string, productId?: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const cleanProductId =
        productId === 'null' || productId === 'undefined' || !productId
          ? undefined
          : productId;

      const dynamicApplicabilityRule = cleanProductId
        ? or(
            isNull(promotion_targets.id),
            eq(promotion_targets.target_id, cleanProductId),
          )
        : isNull(promotion_targets.id);

      const validCoupons = await this.db
        .select({
          id: coupons.id,
          code: coupons.code,
          description: coupons.description,
          promotion_type: promotions.promotion_type,
          discount_config: promotions.discount_config,
          valid_from: promotions.valid_from,
          valid_to: promotions.valid_to,
        })
        .from(promotions)
        .innerJoin(coupons, eq(promotions.coupon_id, coupons.id))
        .leftJoin(
          promotion_targets,
          eq(promotion_targets.promotion_id, promotions.id),
        )
        .where(
          and(
            eq(promotions.company_id, companyId),
            eq(promotions.status, PromotionStatus.ACTIVE),
            gte(promotions.valid_to, new Date()),
            dynamicApplicabilityRule,
          ),
        )
        .groupBy(coupons.id, promotions.id); // Deduplicate rows if multiple targets trigger

      return validCoupons.map((row) => {
        const config = row.discount_config as any;
        return {
          ...row,
          discount_type:
            row.promotion_type === 'percentage_off'
              ? 'percentage'
              : 'fixed_cart',
          discount_value: config?.value || 0,
          max_discount_amount: config?.cap || null,
        };
      });
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch coupons', {
        cause: error,
      });
    }
  }

  async findOne(id: string, domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const [coupon] = await this.db
        .select({
          id: coupons.id,
          code: coupons.code,
          description: coupons.description,
          is_active: coupons.is_active,
          created_at: coupons.created_at,
          promo_id: promotions.id,
          promotion_type: promotions.promotion_type,
          discount_config: promotions.discount_config,
          valid_from: promotions.valid_from,
          valid_to: promotions.valid_to,
          max_uses_total: promotions.max_uses_total,
          max_uses_per_user: promotions.max_uses_per_user,
        })
        .from(coupons)
        .innerJoin(promotions, eq(promotions.coupon_id, coupons.id))
        .where(and(eq(coupons.id, id), eq(coupons.company_id, companyId)))
        .limit(1);

      if (!coupon) throw new NotFoundException('Coupon not found');

      const config = coupon.discount_config as any;
      return {
        id: coupon.id,
        code: coupon.code,
        description: coupon.description,
        is_active: coupon.is_active,
        created_at: coupon.created_at,
        discount_type:
          coupon.promotion_type === 'percentage_off'
            ? 'percentage'
            : 'fixed_cart',
        discount_value: config?.value || 0,
        max_discount_amount: config?.cap || null,
        valid_from: coupon.valid_from,
        valid_to: coupon.valid_to,
        max_uses: coupon.max_uses_total,
        max_uses_per_user: coupon.max_uses_per_user,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Failed to fetch coupon', {
        cause: error,
      });
    }
  }

  async update(id: string, updateCouponDto: UpdateCouponDto, domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);

      const [existingCoupon] = await this.db
        .select()
        .from(coupons)
        .where(eq(coupons.id, id))
        .limit(1);

      if (!existingCoupon) throw new NotFoundException('Coupon not found');

      // Update base lookup
      await this.db
        .update(coupons)
        .set({ is_active: updateCouponDto.is_active })
        .where(and(eq(coupons.id, id), eq(coupons.company_id, companyId)));

      // Prepare updated payload for unified promotions engine
      const promoUpdates: any = {};
      if (updateCouponDto.is_active !== undefined) {
        promoUpdates.status = updateCouponDto.is_active
          ? PromotionStatus.ACTIVE
          : PromotionStatus.DRAFT;
      }
      if (updateCouponDto.valid_from)
        promoUpdates.valid_from = new Date(updateCouponDto.valid_from);
      if (updateCouponDto.valid_to)
        promoUpdates.valid_to = new Date(updateCouponDto.valid_to);
      if (updateCouponDto.max_uses)
        promoUpdates.max_uses_total = updateCouponDto.max_uses;

      if (
        updateCouponDto.discount_value ||
        updateCouponDto.max_discount_amount
      ) {
        // Fetch current to merge state properly if needed
        const [currentPromo] = await this.db
          .select()
          .from(promotions)
          .where(eq(promotions.coupon_id, id));
        let newConfig = { ...(currentPromo.discount_config as any) };
        if (updateCouponDto.discount_value)
          newConfig.value = Number(updateCouponDto.discount_value);
        if (updateCouponDto.max_discount_amount)
          newConfig.cap = Number(updateCouponDto.max_discount_amount);
        promoUpdates.discount_config = newConfig;
      }

      if (Object.keys(promoUpdates).length > 0) {
        await this.db
          .update(promotions)
          .set(promoUpdates)
          .where(eq(promotions.coupon_id, id));
      }

      return { message: 'Coupon successfully updated.' };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Failed to update coupon', {
        cause: error,
      });
    }
  }

  async remove(id: string, domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);

      // Deactivate base code
      await this.db
        .update(coupons)
        .set({ is_active: false })
        .where(and(eq(coupons.id, id), eq(coupons.company_id, companyId)));

      // Deactivate parent promotion link
      await this.db
        .update(promotions)
        .set({ status: 'INACTIVE' as any })
        .where(eq(promotions.coupon_id, id));

      return { message: 'Coupon deactivated successfully' };
    } catch (error) {
      throw new InternalServerErrorException('Failed to remove coupon', {
        cause: error,
      });
    }
  }
}
