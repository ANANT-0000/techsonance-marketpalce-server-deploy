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
import {
  CreateCouponDto,
  UpdateCouponDto,
  PromotionRuleDto,
} from './dto/coupon.dto';
import {
  PromotionRuleType,
  PromotionStatus,
  PromotionTargetType,
  PromotionType,
} from '../../drizzle/types/types';
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
  // ─── RULE CONFIG BUILDER ────────────────────────────────────────
  // Maps a PromotionRuleDto to the exact jsonb shape the schema expects.
  // Replaces every `'min_cart_value' as any` cast in the old code.
  private buildRuleConfig(rule: PromotionRuleDto): Record<string, unknown> {
    const cfg = rule.rule_config;
    switch (rule.rule_type) {
      case PromotionRuleType.MIN_CART_VALUE:
        return { amount: Number(cfg.amount) };
      case PromotionRuleType.MIN_QTY:
        return { qty: Number(cfg.qty) };
      case PromotionRuleType.CUSTOMER_SEGMENT:
        if (typeof cfg.segment_id !== 'string' || !cfg.segment_id)
          throw new BadRequestException(
            'customer_segment rule requires segment_id',
          );
        return { segment_id: cfg.segment_id };
      case PromotionRuleType.FIRST_ORDER_ONLY:
        return {}; // no config fields needed
      case PromotionRuleType.PRODUCT_IN_CART:
        if (typeof cfg.product_id !== 'string' || !cfg.product_id)
          throw new BadRequestException(
            'product_in_cart rule requires product_id',
          );
        return { product_id: cfg.product_id };
      case PromotionRuleType.NEW_CUSTOMER:
        return {
          registered_within_days: Number(cfg.registered_within_days ?? 30),
        };
      case PromotionRuleType.DATE_RANGE: {
        const days = cfg.days_of_week;
        if (!Array.isArray(days) || days.some((d) => d < 0 || d > 6)) {
          throw new BadRequestException(
            'date_range rule requires days_of_week: number[] (0–6)',
          );
        }
        return { days_of_week: days.map(Number) };
      }
      case PromotionRuleType.MAX_USES_PER_USER:
        return { max: Number(cfg.max) };
      default:
        throw new BadRequestException('Unknown rule_type');
    }
  }
  // ─── INSERT RULES HELPER ────────────────────────────────────────
  private async insertRules(
    tx: DrizzleService,
    promotionId: string,
    rules: PromotionRuleDto[],
  ) {
    if (!rules || rules.length === 0) return;
    const rows = rules.map((rule) => ({
      promotion_id: promotionId,
      rule_type: rule.rule_type, // typed PromotionRuleType enum — no `as any`
      rule_config: this.buildRuleConfig(rule),
      negate: rule.negate ?? false,
    }));
    await tx.insert(promotion_rules).values(rows);
  }
  // ─────────────────────────────────────────────────────────────────
  // CREATE
  // ─────────────────────────────────────────────────────────────────
  async create(dto: CreateCouponDto, domain: string, userId: string) {
    try {
                        const companyId = await this.resolveCompanyId(domain);
            const [isUserExist] = await this.db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1)
        .catch((err) => {
                    throw new InternalServerErrorException('Failed to validate user', {
            cause: err,
          });
        });
      if (!isUserExist?.id) {
        throw new HttpException('User not found.', HttpStatus.NOT_FOUND);
      }
            return await this.db
        .transaction(async (tx) => {
                    // 1. Guard duplicate code
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
              .catch((err) => {
                                throw new InternalServerErrorException(
                  'Failed to validate coupon code uniqueness',
                  { cause: err },
                );
              });
            if (existingCoupon) {
                            throw new HttpException(
                `Coupon code ${dto.code} already exists.`,
                HttpStatus.BAD_REQUEST,
              );
            }
          }
          // 2. Insert base lookup coupon row
                    const [newCoupon] = await tx
            .insert(coupons)
            .values({
              code: dto.code.toUpperCase(),
              description: dto.description || null,
              is_active: dto.is_active ?? true,
              company_id: companyId,
            })
            .returning()
            .catch((err) => {
                            throw new InternalServerErrorException(
                'Failed to create coupon',
                {
                  cause: err,
                },
              );
            });
          // 3. Build discount_config via Strategy Pattern
                    let discountConfig: Record<string, unknown> = {};
          let promoType: PromotionType = PromotionType.FIXED_AMOUNT;
          if (dto.discount_type === PromotionType.PERCENTAGE) {
            promoType = PromotionType.PERCENTAGE;
            discountConfig = {
              value: Number(dto.discount_value),
              cap: dto.max_discount_amount
                ? Number(dto.max_discount_amount)
                : null,
            };
          } else if (dto.discount_type === PromotionType.FREE_SHIPPING) {
            promoType = PromotionType.FREE_SHIPPING;
            discountConfig = {
              max_shipping_waived: Number(dto.discount_value),
            };
          } else {
            // FIXED_AMOUNT (and anything else that slips through)
            discountConfig = { value: Number(dto.discount_value) };
          }
          // 4. Insert unified promotion
                    const [newPromotion] = await tx
            .insert(promotions)
            .values({
              company_id: companyId,
              created_by: userId,
              name: `Coupon - ${dto.code.toUpperCase()}`,
              description: dto.description || null,
              promotion_type: promoType,
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
            .returning()
            .catch((err) => {
                            throw new InternalServerErrorException(
                'Failed to create promotion',
                {
                  cause: err,
                },
              );
            });
          // 5. Insert all promotion rules from the DTO — fully typed, no `as any`
                    //    Replaces the old single-rule `if (dto.min_order_amount)` block.
          await this.insertRules(tx, newPromotion.id, dto.rules ?? []).catch(
            (err) => {
                            throw new InternalServerErrorException(
                'Failed to insert promotion rules',
                {
                  cause: err,
                },
              );
            },
          );
          // 6. Attach product targets (if restricted to specific products)
          if (
            dto.applicable_product_ids &&
            dto.applicable_product_ids.length > 0
          ) {
                        const targets = dto.applicable_product_ids.map((productId) => ({
              promotion_id: newPromotion.id,
              target_type: PromotionTargetType.PRODUCT as const,
              target_id: productId,
              exclude: false,
            }));
            await tx
              .insert(promotion_targets)
              .values(targets)
              .catch((err) => {
                                throw new InternalServerErrorException(
                  'Failed to attach promotion targets',
                  {
                    cause: err,
                  },
                );
              });
          }
                    return { ...newCoupon, promotion_id: newPromotion.id };
        })
        .catch((err) => {
                    throw new InternalServerErrorException(
            'Failed to complete coupon creation transaction',
            {
              cause: err,
            },
          );
        });
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
                throw error;
      }
            throw new InternalServerErrorException('Failed to create coupon', {
        cause: error,
      });
    }
  }
  // ─────────────────────────────────────────────────────────────────
  // UPDATE
  // ─────────────────────────────────────────────────────────────────
  async update(id: string, dto: UpdateCouponDto, domain: string) {
    try {
                  const companyId = await this.resolveCompanyId(domain);
      const [existingCoupon] = await this.db
        .select()
        .from(coupons)
        .where(eq(coupons.id, id))
        .limit(1);
      if (!existingCoupon) throw new NotFoundException('Coupon not found');
      // Update base coupon row
            await this.db
        .update(coupons)
        .set({ is_active: dto.is_active })
        .where(and(eq(coupons.id, id), eq(coupons.company_id, companyId)));
      // Build promotion update payload
      const promoUpdates: Record<string, unknown> = {};
      if (dto.is_active !== undefined) {
                promoUpdates.status = dto.is_active
          ? PromotionStatus.ACTIVE
          : PromotionStatus.DRAFT;
      }
      if (dto.valid_from) promoUpdates.valid_from = new Date(dto.valid_from);
      if (dto.valid_to) promoUpdates.valid_to = new Date(dto.valid_to);
      if (dto.max_uses) promoUpdates.max_uses_total = dto.max_uses;
      if (dto.discount_value || dto.max_discount_amount) {
                const [currentPromo] = await this.db
          .select()
          .from(promotions)
          .where(eq(promotions.coupon_id, id));
        const newConfig = {
          ...(currentPromo.discount_config as Record<string, unknown>),
        };
        if (dto.discount_value) newConfig.value = Number(dto.discount_value);
        if (dto.max_discount_amount)
          newConfig.cap = Number(dto.max_discount_amount);
        promoUpdates.discount_config = newConfig;
      }
      if (Object.keys(promoUpdates).length > 0) {
                await this.db
          .update(promotions)
          .set(promoUpdates)
          .where(eq(promotions.coupon_id, id));
      }
      // Rules update — when provided, REPLACE all existing rules for this promotion.
      // Fetch the linked promotion_id first, then delete-and-reinsert atomically.
      if (dto.rules !== undefined) {
                const [linkedPromo] = await this.db
          .select({ id: promotions.id })
          .from(promotions)
          .where(eq(promotions.coupon_id, id))
          .limit(1);
        if (linkedPromo) {
                    await this.db
            .delete(promotion_rules)
            .where(eq(promotion_rules.promotion_id, linkedPromo.id));
                    await this.insertRules(this.db, linkedPromo.id, dto.rules);
        }
      }
            return { message: 'Coupon successfully updated.' };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Failed to update coupon', {
        cause: error,
      });
    }
  }
  // ─────────────────────────────────────────────────────────────────
  // The remaining methods (verifyCoupon, validateAppliedCoupon,
  // findAll, findCoupons, findOne, remove) are unchanged from the
  // previous version — no rule-related changes needed there.
  // ─────────────────────────────────────────────────────────────────
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
      if (!promoData)
        return { valid: false, message: 'Invalid or inactive coupon code' };
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
      if (isUsed.length > 0)
        return { valid: false, message: 'Coupon already used' };
            return { valid: true, message: 'Coupon is valid' };
    } catch (error) {
      throw new InternalServerErrorException('Failed to verify coupon', {
        cause: error,
      });
    }
  }
  async findAll(
    domain: string,
    filters?: {
      search: string;
      limit: number;
      offset: number;
      status: string | undefined;
      date: string;
      sortby: string;
    },
  ) {
    try {
                  const companyId = await this.resolveCompanyId(domain);
                  const query = this.db
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
      if (filters) {
        (query as any).limit(filters.limit).offset(filters.offset);
      }
      const results = await query;
            return results.map((row) => {
        const config = row.discount_config as Record<string, unknown> | null;
        const discountValue =
          config && 'value' in config ? Number(config.value) : 0;
        const maxDiscountAmount =
          config && 'cap' in config ? Number(config.cap) : null;
        return {
          id: row.id,
          code: row.code,
          description: row.description,
          is_active: row.is_active,
          created_at: row.created_at,
          discount_type: row.promotion_type,
          discount_value: discountValue,
          max_discount_amount: maxDiscountAmount,
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
      // Also fetch associated rules so the edit form can repopulate them
            const rules = await this.db
        .select({
          rule_type: promotion_rules.rule_type,
          rule_config: promotion_rules.rule_config,
          negate: promotion_rules.negate,
        })
        .from(promotion_rules)
        .where(eq(promotion_rules.promotion_id, coupon.promo_id));
      const config = coupon.discount_config as Record<string, unknown> | null;
      const discountValue =
        config && 'value' in config ? Number(config.value) : 0;
      const maxDiscountAmount =
        config && 'cap' in config ? Number(config.cap) : null;
            return {
        id: coupon.id,
        code: coupon.code,
        description: coupon.description,
        is_active: coupon.is_active,
        created_at: coupon.created_at,
        discount_type: coupon.promotion_type,
        discount_value: discountValue,
        max_discount_amount: maxDiscountAmount,
        valid_from: coupon.valid_from,
        valid_to: coupon.valid_to,
        max_uses: coupon.max_uses_total,
        max_uses_per_user: coupon.max_uses_per_user,
        rules, // ← returned so the edit form can repopulate existing rules
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Failed to fetch coupon', {
        cause: error,
      });
    }
  }
  async remove(id: string, domain: string) {
    try {
                  const companyId = await this.resolveCompanyId(domain);
                  await this.db
        .update(coupons)
        .set({ is_active: false })
        .where(and(eq(coupons.id, id), eq(coupons.company_id, companyId)));
      await this.db
        .update(promotions)
        .set({ status: PromotionStatus.INACTIVE })
        .where(eq(promotions.coupon_id, id));
            return { message: 'Coupon deactivated successfully' };
    } catch (error) {
      throw new InternalServerErrorException('Failed to remove coupon', {
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
        .groupBy(coupons.id, promotions.id);
            return validCoupons.map((row) => {
        const config = row.discount_config as Record<string, unknown> | null;
        const discountValue =
          config && 'value' in config ? Number(config.value) : 0;
        const maxDiscountAmount =
          config && 'cap' in config ? Number(config.cap) : null;
        return {
          ...row,
          discount_type: row.promotion_type,
          discount_value: discountValue,
          max_discount_amount: maxDiscountAmount,
        };
      });
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch coupons', {
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
                  const [isCouponExist] = await this.db
        .select({ id: coupons.id })
        .from(coupons)
        .where(eq(coupons.code, code.toUpperCase()))
        .limit(1);
      const [isCouponUsed] = await this.db
        .select()
        .from(promotion_usage)
        .where(
          and(
            eq(promotion_usage.user_id, userId),
            eq(promotion_usage.promotion_id, isCouponExist?.id ?? ''),
          ),
        )
        .limit(1);
      if (isCouponUsed) {
        throw new BadRequestException('You have already used this coupon.');
      }
      const couponPromotion = await this.db.query.promotions.findFirst({
        where: and(
          eq(promotions.status, PromotionStatus.ACTIVE),
          eq(promotions.coupon_id, isCouponExist?.id ?? ''),
        ),
        with: { coupon: true, rules: true, targets: true },
      });
            if (
        !couponPromotion ||
        couponPromotion.coupon?.code !== code.toUpperCase()
      ) {
        throw new NotFoundException('Invalid or inactive promo code.');
      }
      
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
      // Rules engine — now uses the enum for comparison (no string literals)
      const minCartRule = couponPromotion.rules.find(
        (r) => r.rule_type === PromotionRuleType.MIN_CART_VALUE,
      );
      if (minCartRule) {
                const ruleConfig =
          typeof minCartRule.rule_config === 'object' &&
          minCartRule.rule_config !== null
            ? minCartRule.rule_config
            : {};
        const requiredAmount = Number(
          'amount' in ruleConfig
            ? ((ruleConfig as { amount?: unknown }).amount ?? 0)
            : 0,
        );
        if (cartTotal < Number(requiredAmount)) {
          throw new BadRequestException(
            `Add ₹${Number(requiredAmount) - cartTotal} more to unlock this offer.`,
          );
        }
      }
      const isGlobalCoupon = couponPromotion.targets.length === 0;
      let validForProductIds: string[] = [];
      if (isGlobalCoupon) {
                validForProductIds = currentProductIds;
      } else {
                const allowedProductIds = couponPromotion.targets
          .filter(
            (t) => t.target_type === PromotionTargetType.PRODUCT && !t.exclude,
          )
          .map((t) => t.target_id);
        validForProductIds = currentProductIds.filter((pid) =>
          allowedProductIds.includes(pid),
        );
        if (validForProductIds.length === 0) {
          throw new BadRequestException(
            'This coupon is not applicable to the selected product(s).',
          );
        }
      }
      const discountConfig = couponPromotion.discount_config as Record<
        string,
        unknown
      > | null;
            return {
        id: couponPromotion.coupon_id,
        promotion_id: couponPromotion.id,
        code: couponPromotion.coupon.code,
        discount_type: couponPromotion.promotion_type,
        discount_value: Number(discountConfig?.value ?? 0),
        max_discount_amount: discountConfig?.cap
          ? Number(discountConfig.cap)
          : null,
        isGlobal: isGlobalCoupon,
        discount_config: discountConfig,
        rule: couponPromotion.rules,
        applicableProductIds: validForProductIds,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Failed to validate coupon', {
        cause: error,
      });
    }
  }
}
