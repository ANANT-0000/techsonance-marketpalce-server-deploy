import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import {
  promotion_analytics_events,
  promotion_rules,
  promotion_targets,
  promotion_usage,
  promotions,
} from '../../drizzle/schema';
import { CompanyService } from '../company/company.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import {
  PromoEventType,
  PromotionStatus,
  PromotionType,
} from '../../drizzle/types/types';
import { CreatePromotionDto } from './dto/promotions..dto';
import { PromotionsErrorKeyEnum } from './constants/promotions.enums';

@Injectable()
export class PromotionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
  ) {}

  private async resolveCompanyId(domain: string): Promise<string> {
    try {
      const companyId = await this.companyService.find(domainExtractor(domain));
      return companyId;
    } catch (err) {
      throw new InternalServerErrorException(PromotionsErrorKeyEnum.FAILED_TO_RESOLVE_COMPANY_ID, {
        cause: err,
      });
    }
  }

  // Validate discount_config shape matches promotion_type.
  // Called on create and update to catch frontend mistakes early.
  private validateDiscountConfig(
    type: PromotionType,
    config: Record<string, unknown>,
  ) {
    switch (type) {
      case PromotionType.PERCENTAGE:
        if (
          typeof config.value !== 'number' ||
          config.value <= 0 ||
          config.value > 100
        )
          throw new BadRequestException(
            'percentage_off requires value: number (1–100)',
          );
        break;
      case PromotionType.FIXED_AMOUNT:
        if (typeof config.value !== 'number' || config.value <= 0)
          throw new BadRequestException(
            PromotionsErrorKeyEnum.FIXED_AMOUNT_REQUIRES_VALUE_POSITIVE_NUMBER,
          );
        break;
      case PromotionType.BUY_X_GET_Y:
        if (
          !config.buy_qty ||
          !config.get_qty ||
          !config.get_product_variant_id
        )
          throw new BadRequestException(
            PromotionsErrorKeyEnum.BUY_X_GET_Y_REQUIRES_BUY_QTY_GET_QTY_GET_PRODUCT_VARIANT_ID,
          );
        break;
      case PromotionType.FREE_SHIPPING:
        if (typeof config.max_shipping_waived !== 'number')
          throw new BadRequestException(
            PromotionsErrorKeyEnum.FREE_SHIPPING_REQUIRES_MAX_SHIPPING_WAIVED_NUMBER,
          );
        break;
      case PromotionType.TIERED_DISCOUNT:
        if (!Array.isArray(config.tiers) || config.tiers.length === 0)
          throw new BadRequestException(PromotionsErrorKeyEnum.TIERED_DISCOUNT_REQUIRES_TIERS_ARRAY);
        break;
      case PromotionType.BUNDLE_DEAL:
        if (
          !Array.isArray(config.product_variant_ids) ||
          typeof config.bundle_price !== 'number'
        )
          throw new BadRequestException(
            'bundle_deal requires product_variant_ids[] and bundle_price',
          );
        break;
    }
  }

  // ── findAll ──────────────────────────────────────────────────
  // Returns promotions that are NOT coupon-linked (campaigns only).
  // Coupon promotions are managed by CouponService.
  async findAll(domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);

      const rows = await this.db.query.promotions
        .findMany({
          where: and(
            eq(promotions.company_id, companyId),
            // Exclude coupon-backed promotions — those belong to the coupons module
            sql`${promotions.coupon_id} IS NULL`,
          ),
          with: {
            rules: {
              columns: { rule_type: true, rule_config: true, negate: true },
            },
            targets: {
              columns: { target_type: true, target_id: true, exclude: true },
            },
            usage: { columns: { id: true } },
          },
          orderBy: [desc(promotions.created_at)],
        })
        .catch((err) => {
          throw new InternalServerErrorException(PromotionsErrorKeyEnum.FAILED_TO_FETCH_PROMOTIONS, {
            cause: err,
          });
        });
      return rows.map((p) => ({
        ...p,
        total_used: p.usage.length,
        usage: undefined, // strip raw usage array from list response
      }));
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(PromotionsErrorKeyEnum.FAILED_TO_LIST_PROMOTIONS, {
        cause: error,
      });
    }
  }
  async findOptions(domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);

      const options = await this.db
        .select({
          id: promotions.id,
          name: promotions.name,
        })
        .from(promotions)
        .where(eq(promotions.company_id, companyId))
        .catch((err) => {
          throw new InternalServerErrorException(
            PromotionsErrorKeyEnum.FAILED_TO_FETCH_PROMOTION_OPTIONS,
            {
              cause: err,
            },
          );
        });
      return options;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        PromotionsErrorKeyEnum.FAILED_TO_LIST_PROMOTION_OPTIONS,
        {
          cause: error,
        },
      );
    }
  }
  // ── findOne ──────────────────────────────────────────────────
  async findOne(id: string, domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);

      const row = await this.db.query.promotions
        .findFirst({
          where: and(
            eq(promotions.id, id),
            eq(promotions.company_id, companyId),
          ),
          with: {
            rules: true,
            targets: true,
            usage: { columns: { id: true } },
          },
        })
        .catch((err) => {
          throw new InternalServerErrorException(PromotionsErrorKeyEnum.FAILED_TO_FETCH_PROMOTION, {
            cause: err,
          });
        });

      if (!row) throw new NotFoundException(PromotionsErrorKeyEnum.PROMOTION_NOT_FOUND);
      return { ...row, total_used: row.usage.length };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(PromotionsErrorKeyEnum.FAILED_TO_GET_PROMOTION, {
        cause: error,
      });
    }
  }

  // ── getAnalytics ──────────────────────────────────────────────
  // Funnel counts: viewed → clicked → applied → redeemed
  // Plus total discount granted (for ROI calculation)
  async getAnalytics(id: string, domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);

      const events = await this.db
        .select({
          event_type: promotion_analytics_events.event_type,
          count: sql<number>`COUNT(*)::int`,
          total_discount: sql<number>`COALESCE(SUM(${promotion_analytics_events.discount_amount}), 0)::float`,
        })
        .from(promotion_analytics_events)
        .where(
          and(
            eq(promotion_analytics_events.promotion_id, id),
            eq(promotion_analytics_events.company_id, companyId),
          ),
        )
        .groupBy(promotion_analytics_events.event_type)
        .catch((err) => {
          throw new InternalServerErrorException(
            PromotionsErrorKeyEnum.FAILED_TO_FETCH_PROMOTION_ANALYTICS,
            { cause: err },
          );
        });

      // Pivot into a predictable shape for the frontend
      const funnel = {
        viewed: 0,
        clicked: 0,
        applied: 0,
        redeemed: 0,
        total_discount_granted: 0,
      };

      for (const row of events) {
        const key = row.event_type.toLowerCase() as keyof typeof funnel;
        if (key in funnel) funnel[key] = row.count;
        if (row.event_type === PromoEventType.REDEEMED)
          funnel.total_discount_granted = row.total_discount;
      }

      // Conversion rates
      const viewToRedeem =
        funnel.viewed > 0
          ? ((funnel.redeemed / funnel.viewed) * 100).toFixed(1)
          : '0.0';
      const applyToRedeem =
        funnel.applied > 0
          ? ((funnel.redeemed / funnel.applied) * 100).toFixed(1)
          : '0.0';

      return {
        funnel,
        conversion_rates: {
          view_to_redeem_pct: viewToRedeem,
          apply_to_redeem_pct: applyToRedeem,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        PromotionsErrorKeyEnum.FAILED_TO_GET_PROMOTION_ANALYTICS,
        { cause: error },
      );
    }
  }

  // ── create ────────────────────────────────────────────────────
  async create(dto: CreatePromotionDto, domain: string, userId: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);

      this.validateDiscountConfig(dto.promotion_type, dto.discount_config);

      return await this.db
        .transaction(async (tx) => {
          const [newPromotion] = await tx
            .insert(promotions)
            .values({
              company_id: companyId,
              created_by: userId,
              name: dto.name,
              description: dto.description ?? null,
              internal_note: dto.internal_note ?? null,
              promotion_type: dto.promotion_type,
              discount_config: dto.discount_config,
              is_auto_applied: dto.is_auto_applied ?? false,
              priority: dto.priority ?? 10,
              is_exclusive: dto.is_exclusive ?? false,
              status: dto.status ?? PromotionStatus.DRAFT,
              valid_from: new Date(dto.valid_from),
              valid_to: dto.valid_to ? new Date(dto.valid_to) : null,
              max_uses_total: dto.max_uses_total ?? null,
              max_uses_per_user: dto.max_uses_per_user ?? 1,
            })
            .returning()
            .catch((err) => {
              throw new InternalServerErrorException(
                PromotionsErrorKeyEnum.FAILED_TO_CREATE_PROMOTION,
                { cause: err },
              );
            });

          // Insert rules
          if (dto.rules?.length) {
            await tx
              .insert(promotion_rules)
              .values(
                dto.rules.map((r) => ({
                  promotion_id: newPromotion.id,
                  rule_type: r.rule_type,
                  rule_config: r.rule_config,
                  negate: r.negate ?? false,
                })),
              )
              .catch((err) => {
                throw new InternalServerErrorException(
                  PromotionsErrorKeyEnum.FAILED_TO_INSERT_PROMOTION_RULES,
                  { cause: err },
                );
              });
          }

          // Insert targets
          if (dto.targets?.length) {
            await tx
              .insert(promotion_targets)
              .values(
                dto.targets.map((t) => ({
                  promotion_id: newPromotion.id,
                  target_type: t.target_type,
                  target_id: t.target_id ?? null,
                  exclude: t.exclude ?? false,
                })),
              )
              .catch((err) => {
                throw new InternalServerErrorException(
                  PromotionsErrorKeyEnum.FAILED_TO_INSERT_PROMOTION_TARGETS,
                  { cause: err },
                );
              });
          }

          return newPromotion;
        })
        .catch((err) => {
          if (
            err instanceof HttpException ||
            err instanceof InternalServerErrorException
          )
            throw err; // pass through known exceptions
          throw new InternalServerErrorException(
            PromotionsErrorKeyEnum.FAILED_TO_CREATE_PROMOTION_TRANSACTION,
            { cause: err },
          );
        });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(PromotionsErrorKeyEnum.FAILED_TO_CREATE_PROMOTION, {
        cause: error,
      });
    }
  }

  // ── update ────────────────────────────────────────────────────
  async update(id: string, dto: Partial<CreatePromotionDto>, domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);

      const existing = await this.db.query.promotions
        .findFirst({
          where: and(
            eq(promotions.id, id),
            eq(promotions.company_id, companyId),
          ),
        })
        .catch((err) => {
          throw new InternalServerErrorException(
            PromotionsErrorKeyEnum.FAILED_TO_FETCH_EXISTING_PROMOTION,
            { cause: err },
          );
        });
      if (!existing) throw new NotFoundException(PromotionsErrorKeyEnum.PROMOTION_NOT_FOUND);

      // Validate config only if type or config is changing
      const newType = dto.promotion_type ?? existing.promotion_type;
      const newConfig =
        dto.discount_config ??
        (existing.discount_config as Record<string, unknown>);
      this.validateDiscountConfig(newType, newConfig);

      return await this.db
        .transaction(async (tx) => {
          const updatePayload: Record<string, unknown> = {};
          if (dto.name !== undefined) updatePayload.name = dto.name;
          if (dto.description !== undefined)
            updatePayload.description = dto.description;
          if (dto.internal_note !== undefined)
            updatePayload.internal_note = dto.internal_note;
          if (dto.promotion_type !== undefined)
            updatePayload.promotion_type = dto.promotion_type;
          if (dto.discount_config !== undefined)
            updatePayload.discount_config = dto.discount_config;
          if (dto.is_auto_applied !== undefined)
            updatePayload.is_auto_applied = dto.is_auto_applied;
          if (dto.priority !== undefined) updatePayload.priority = dto.priority;
          if (dto.is_exclusive !== undefined)
            updatePayload.is_exclusive = dto.is_exclusive;
          if (dto.status !== undefined) updatePayload.status = dto.status;
          if (dto.valid_from !== undefined)
            updatePayload.valid_from = new Date(dto.valid_from);
          if (dto.valid_to !== undefined)
            updatePayload.valid_to = new Date(dto.valid_to);
          if (dto.max_uses_total !== undefined)
            updatePayload.max_uses_total = dto.max_uses_total;
          if (dto.max_uses_per_user !== undefined)
            updatePayload.max_uses_per_user = dto.max_uses_per_user;

          const [updated] = await tx
            .update(promotions)
            .set(updatePayload)
            .where(
              and(eq(promotions.id, id), eq(promotions.company_id, companyId)),
            )
            .returning()
            .catch((err) => {
              throw new InternalServerErrorException(
                PromotionsErrorKeyEnum.FAILED_TO_UPDATE_PROMOTION,
                { cause: err },
              );
            });

          // Rules — full replace when provided
          if (dto.rules !== undefined) {
            await tx
              .delete(promotion_rules)
              .where(eq(promotion_rules.promotion_id, id))
              .catch((err) => {
                throw new InternalServerErrorException(
                  PromotionsErrorKeyEnum.FAILED_TO_DELETE_OLD_PROMOTION_RULES,
                  { cause: err },
                );
              });
            if (dto.rules.length) {
              await tx
                .insert(promotion_rules)
                .values(
                  dto.rules.map((r) => ({
                    promotion_id: id,
                    rule_type: r.rule_type,
                    rule_config: r.rule_config,
                    negate: r.negate ?? false,
                  })),
                )
                .catch((err) => {
                  throw new InternalServerErrorException(
                    PromotionsErrorKeyEnum.FAILED_TO_INSERT_PROMOTION_RULES,
                    { cause: err },
                  );
                });
            }
          }

          // Targets — full replace when provided
          if (dto.targets !== undefined) {
            await tx
              .delete(promotion_targets)
              .where(eq(promotion_targets.promotion_id, id))
              .catch((err) => {
                throw new InternalServerErrorException(
                  PromotionsErrorKeyEnum.FAILED_TO_DELETE_OLD_PROMOTION_TARGETS,
                  { cause: err },
                );
              });
            if (dto.targets.length) {
              await tx
                .insert(promotion_targets)
                .values(
                  dto.targets.map((t) => ({
                    promotion_id: id,
                    target_type: t.target_type,
                    target_id: t.target_id ?? null,
                    exclude: t.exclude ?? false,
                  })),
                )
                .catch((err) => {
                  throw new InternalServerErrorException(
                    PromotionsErrorKeyEnum.FAILED_TO_INSERT_PROMOTION_TARGETS,
                    { cause: err },
                  );
                });
            }
          }

          return { success: true, data: updated };
        })
        .catch((err) => {
          throw new InternalServerErrorException(
            PromotionsErrorKeyEnum.FAILED_TO_UPDATE_PROMOTION_TRANSACTION,
            { cause: err },
          );
        });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(PromotionsErrorKeyEnum.FAILED_TO_UPDATE_PROMOTION, {
        cause: error,
      });
    }
  }

  // ── deactivate ────────────────────────────────────────────────
  // Soft delete — sets status to INACTIVE, never hard deletes
  // because promotion_usage rows reference the promotion with onDelete: restrict
  async deactivate(id: string, domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);

      await this.db
        .update(promotions)
        .set({ status: PromotionStatus.INACTIVE })
        .where(and(eq(promotions.id, id), eq(promotions.company_id, companyId)))
        .catch((err) => {
          throw new InternalServerErrorException(
            PromotionsErrorKeyEnum.FAILED_TO_DEACTIVATE_PROMOTION,
            { cause: err },
          );
        });

      return { success: true, message: 'Campaign deactivated' };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(PromotionsErrorKeyEnum.FAILED_TO_DEACTIVATE_PROMOTION, {
        cause: error,
      });
    }
  }

}
