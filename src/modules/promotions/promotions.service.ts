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

@Injectable()
export class PromotionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
  ) {}

  private async resolveCompanyId(domain: string): Promise<string> {
    console.log(
      '[PromotionsService.resolveCompanyId] Resolving company for',
      domain,
    );
    try {
      const companyId = await this.companyService.find(domainExtractor(domain));
      console.log(
        '[PromotionsService.resolveCompanyId] Resolved company id:',
        companyId,
      );
      return companyId;
    } catch (err) {
      console.error(
        '[PromotionsService.resolveCompanyId] Error resolving company id:',
        err,
      );
      throw new InternalServerErrorException('Failed to resolve company id', {
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
            'fixed_amount requires value: positive number',
          );
        break;
      case PromotionType.BUY_X_GET_Y:
        if (
          !config.buy_qty ||
          !config.get_qty ||
          !config.get_product_variant_id
        )
          throw new BadRequestException(
            'buy_x_get_y requires buy_qty, get_qty, get_product_variant_id',
          );
        break;
      case PromotionType.FREE_SHIPPING:
        if (typeof config.max_shipping_waived !== 'number')
          throw new BadRequestException(
            'free_shipping requires max_shipping_waived: number',
          );
        break;
      case PromotionType.TIERED_DISCOUNT:
        if (!Array.isArray(config.tiers) || config.tiers.length === 0)
          throw new BadRequestException('tiered_discount requires tiers array');
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
    console.log(
      '[PromotionsService.findAll] Request received for domain:',
      domain,
    );
    try {
      const companyId = await this.resolveCompanyId(domain);
      console.log('[PromotionsService.findAll] Company resolved:', companyId);

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
          console.error(
            '[PromotionsService.findAll] Error fetching promotions:',
            err,
          );
          throw new InternalServerErrorException('Failed to fetch promotions', {
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
      console.error('[PromotionsService.findAll] Unexpected error:', error);
      throw new InternalServerErrorException('Failed to list promotions', {
        cause: error,
      });
    }
  }
  async findOptions(domain: string) {
    console.log(
      '[PromotionsService.findOptions] Request received for domain:',
      domain,
    );
    try {
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        '[PromotionsService.findOptions] Company resolved:',
        companyId,
      );

      const options = await this.db
        .select({
          id: promotions.id,
          name: promotions.name,
        })
        .from(promotions)
        .where(eq(promotions.company_id, companyId))
        .catch((err) => {
          console.error(
            '[PromotionsService.findOptions] Error fetching promotion options:',
            err,
          );
          throw new InternalServerErrorException(
            'Failed to fetch promotion options',
            {
              cause: err,
            },
          );
        });
      return options;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error('[PromotionsService.findOptions] Unexpected error:', error);
      throw new InternalServerErrorException(
        'Failed to list promotion options',
        {
          cause: error,
        },
      );
    }
  }
  // ── findOne ──────────────────────────────────────────────────
  async findOne(id: string, domain: string) {
    console.log(
      '[PromotionsService.findOne] Request received for id:',
      id,
      'domain:',
      domain,
    );
    try {
      const companyId = await this.resolveCompanyId(domain);
      console.log('[PromotionsService.findOne] Company resolved:', companyId);

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
          console.error(
            '[PromotionsService.findOne] Error fetching promotion:',
            err,
          );
          throw new InternalServerErrorException('Failed to fetch promotion', {
            cause: err,
          });
        });

      if (!row) throw new NotFoundException('Promotion not found');
      return { ...row, total_used: row.usage.length };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error('[PromotionsService.findOne] Unexpected error:', error);
      throw new InternalServerErrorException('Failed to get promotion', {
        cause: error,
      });
    }
  }

  // ── getAnalytics ──────────────────────────────────────────────
  // Funnel counts: viewed → clicked → applied → redeemed
  // Plus total discount granted (for ROI calculation)
  async getAnalytics(id: string, domain: string) {
    console.log(
      '[PromotionsService.getAnalytics] Request received for id:',
      id,
      'domain:',
      domain,
    );
    try {
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        '[PromotionsService.getAnalytics] Company resolved:',
        companyId,
      );

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
          console.error(
            '[PromotionsService.getAnalytics] Error fetching analytics events:',
            err,
          );
          throw new InternalServerErrorException(
            'Failed to fetch promotion analytics',
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
      console.error(
        '[PromotionsService.getAnalytics] Unexpected error:',
        error,
      );
      throw new InternalServerErrorException(
        'Failed to get promotion analytics',
        { cause: error },
      );
    }
  }

  // ── create ────────────────────────────────────────────────────
  async create(dto: CreatePromotionDto, domain: string, userId: string) {
    console.log('[PromotionsService.create] Request received');
    try {
      const companyId = await this.resolveCompanyId(domain);
      console.log('[PromotionsService.create] Company resolved:', companyId);

      this.validateDiscountConfig(dto.promotion_type, dto.discount_config);
      console.log('[PromotionsService.create] Discount config validated');

      console.log('[PromotionsService.create] Starting transaction');
      return await this.db
        .transaction(async (tx) => {
          console.log('[PromotionsService.create] Transaction started');
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
              console.error(
                '[PromotionsService.create] Error inserting promotion:',
                err,
              );
              throw new InternalServerErrorException(
                'Failed to create promotion',
                { cause: err },
              );
            });

          // Insert rules
          if (dto.rules?.length) {
            console.log(
              '[PromotionsService.create] Inserting rules count:',
              dto.rules.length,
            );
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
                console.error(
                  '[PromotionsService.create] Error inserting rules:',
                  err,
                );
                throw new InternalServerErrorException(
                  'Failed to insert promotion rules',
                  { cause: err },
                );
              });
          }

          // Insert targets
          if (dto.targets?.length) {
            console.log(
              '[PromotionsService.create] Inserting targets count:',
              dto.targets.length,
            );
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
                console.error(
                  '[PromotionsService.create] Error inserting targets:',
                  err,
                );
                throw new InternalServerErrorException(
                  'Failed to insert promotion targets',
                  { cause: err },
                );
              });
          }

          return newPromotion;
        })
        .catch((err) => {
          console.error('[PromotionsService.create] Transaction error:', err);
          if (
            err instanceof HttpException ||
            err instanceof InternalServerErrorException
          )
            throw err; // pass through known exceptions
          throw new InternalServerErrorException(
            'Failed to create promotion transaction',
            { cause: err },
          );
        });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error('[PromotionsService.create] Unexpected error:', error);
      throw new InternalServerErrorException('Failed to create promotion', {
        cause: error,
      });
    }
  }

  // ── update ────────────────────────────────────────────────────
  async update(id: string, dto: Partial<CreatePromotionDto>, domain: string) {
    console.log('[PromotionsService.update] Request received for id:', id);
    try {
      const companyId = await this.resolveCompanyId(domain);
      console.log('[PromotionsService.update] Company resolved:', companyId);

      const existing = await this.db.query.promotions
        .findFirst({
          where: and(
            eq(promotions.id, id),
            eq(promotions.company_id, companyId),
          ),
        })
        .catch((err) => {
          console.error(
            '[PromotionsService.update] Error fetching existing promotion:',
            err,
          );
          throw new InternalServerErrorException(
            'Failed to fetch existing promotion',
            { cause: err },
          );
        });
      if (!existing) throw new NotFoundException('Promotion not found');

      // Validate config only if type or config is changing
      const newType = dto.promotion_type ?? existing.promotion_type;
      const newConfig =
        dto.discount_config ??
        (existing.discount_config as Record<string, unknown>);
      this.validateDiscountConfig(newType, newConfig);
      console.log('[PromotionsService.update] Discount config validated');

      console.log('[PromotionsService.update] Starting transaction');
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
              console.error(
                '[PromotionsService.update] Error updating promotion:',
                err,
              );
              throw new InternalServerErrorException(
                'Failed to update promotion',
                { cause: err },
              );
            });

          // Rules — full replace when provided
          if (dto.rules !== undefined) {
            console.log(
              '[PromotionsService.update] Replacing rules, count:',
              dto.rules.length,
            );
            await tx
              .delete(promotion_rules)
              .where(eq(promotion_rules.promotion_id, id))
              .catch((err) => {
                console.error(
                  '[PromotionsService.update] Error deleting old rules:',
                  err,
                );
                throw new InternalServerErrorException(
                  'Failed to delete old promotion rules',
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
                  console.error(
                    '[PromotionsService.update] Error inserting new rules:',
                    err,
                  );
                  throw new InternalServerErrorException(
                    'Failed to insert promotion rules',
                    { cause: err },
                  );
                });
            }
          }

          // Targets — full replace when provided
          if (dto.targets !== undefined) {
            console.log(
              '[PromotionsService.update] Replacing targets, count:',
              dto.targets.length,
            );
            await tx
              .delete(promotion_targets)
              .where(eq(promotion_targets.promotion_id, id))
              .catch((err) => {
                console.error(
                  '[PromotionsService.update] Error deleting old targets:',
                  err,
                );
                throw new InternalServerErrorException(
                  'Failed to delete old promotion targets',
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
                  console.error(
                    '[PromotionsService.update] Error inserting new targets:',
                    err,
                  );
                  throw new InternalServerErrorException(
                    'Failed to insert promotion targets',
                    { cause: err },
                  );
                });
            }
          }

          return { success: true, data: updated };
        })
        .catch((err) => {
          console.error('[PromotionsService.update] Transaction error:', err);
          throw new InternalServerErrorException(
            'Failed to update promotion transaction',
            { cause: err },
          );
        });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error('[PromotionsService.update] Unexpected error:', error);
      throw new InternalServerErrorException('Failed to update promotion', {
        cause: error,
      });
    }
  }

  // ── deactivate ────────────────────────────────────────────────
  // Soft delete — sets status to INACTIVE, never hard deletes
  // because promotion_usage rows reference the promotion with onDelete: restrict
  async deactivate(id: string, domain: string) {
    console.log('[PromotionsService.deactivate] Request received for id:', id);
    try {
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        '[PromotionsService.deactivate] Company resolved:',
        companyId,
      );

      await this.db
        .update(promotions)
        .set({ status: PromotionStatus.INACTIVE })
        .where(and(eq(promotions.id, id), eq(promotions.company_id, companyId)))
        .catch((err) => {
          console.error(
            '[PromotionsService.deactivate] Error deactivating promotion:',
            err,
          );
          throw new InternalServerErrorException(
            'Failed to deactivate promotion',
            { cause: err },
          );
        });

      return { success: true, message: 'Campaign deactivated' };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error('[PromotionsService.deactivate] Unexpected error:', error);
      throw new InternalServerErrorException('Failed to deactivate promotion', {
        cause: error,
      });
    }
  }

}
