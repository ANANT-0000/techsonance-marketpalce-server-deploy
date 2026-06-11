import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import {
  marketing_banners,
  orders,
  promotion_analytics_events,
  promotions,
  promotion_usage,
} from '../../drizzle/schema';
import { CompanyService } from '../company/company.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { BannerPlacement, PromoEventType } from '../../drizzle/types/types';
import { CreateBannerDto } from './dto/banner.dto';
import { UploadToCloudService } from '../../utils/upload-to-cloud/upload-to-cloud.service';
import { BannersErrorKeyEnum } from './constants/banners.enums';

// export interface CreateBannerDto {
//   placement: BannerPlacement;
//   image_url: string;
//   image_url_mobile?: string;
//   image_alt_text?: string;
//   headline?: string;
//   sub_headline?: string;
//   cta_label?: string;
//   cta_url?: string;
//   valid_from?: string;
//   valid_to?: string;
//   display_order?: number;
//   promotion_id?: string;
//   is_active?: boolean;
// }

@Injectable()
export class BannersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
    private readonly uploadToCloudService: UploadToCloudService,
  ) {}

  private async resolveCompanyId(domain: string) {
    try {
      const companyId = await this.companyService.find(domainExtractor(domain));
      return companyId;
    } catch (err) {
      throw new InternalServerErrorException(BannersErrorKeyEnum.FAILED_TO_RESOLVE_COMPANY, {
        cause: err,
      });
    }
  }

  async findAll(domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const rows = await this.db.query.marketing_banners
        .findMany({
          where: eq(marketing_banners.company_id, companyId),
          with: {
            promotion: { columns: { id: true, name: true, status: true } },
          },
          orderBy: [desc(marketing_banners.display_order)],
        })
        .catch((err) => {
          throw new InternalServerErrorException(BannersErrorKeyEnum.FAILED_TO_FETCH_BANNERS, {
            cause: err,
          });
        });
      return rows;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(BannersErrorKeyEnum.FAILED_TO_LIST_BANNERS, {
        cause: error,
      });
    }
  }

  // Storefront-facing: only active banners for a placement slot,
  // within their validity window. Called by the frontend storefront,
  // not the vendor dashboard.
  async findActive(domain: string, placement: BannerPlacement) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const now = new Date();
      const rows = await this.db.query.marketing_banners
        .findMany({
          where: and(
            eq(marketing_banners.company_id, companyId),
            eq(marketing_banners.placement, placement),
            eq(marketing_banners.is_active, true),
            // valid_from null means always visible
            sql`(${marketing_banners.valid_from} IS NULL OR ${marketing_banners.valid_from} <= ${now})`,
            // valid_to null means no expiry
            sql`(${marketing_banners.valid_to} IS NULL OR ${marketing_banners.valid_to} >= ${now})`,
          ),
          orderBy: [desc(marketing_banners.display_order)],
        })
        .catch((err) => {
          throw new InternalServerErrorException(
            BannersErrorKeyEnum.FAILED_TO_FETCH_ACTIVE_BANNERS,
            { cause: err },
          );
        });
      return { success: true, data: rows };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(BannersErrorKeyEnum.FAILED_TO_LIST_ACTIVE_BANNERS, {
        cause: error,
      });
    }
  }
  async findOne(id: string, domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const [isExisting] = await this.db
        .select({ id: marketing_banners.id })
        .from(marketing_banners)
        .where(
          and(
            eq(marketing_banners.id, id),
            eq(marketing_banners.company_id, companyId),
          ),
        )
        .catch((err) => {
          throw new InternalServerErrorException(BannersErrorKeyEnum.FAILED_TO_FETCH_BANNER, {
            cause: err,
          });
        });
      if (!isExisting || !isExisting.id)
        throw new NotFoundException(BannersErrorKeyEnum.BANNER_DOES_NOT_EXIST);
      return isExisting;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(BannersErrorKeyEnum.FAILED_TO_FETCH_BANNER, {
        cause: error,
      });
    }
  }
  async getBannerDetails(bannerId: string, domain: string) {
    const companyId = await this.resolveCompanyId(domain);

    // Using Drizzle Query Builder with Left Joins to get names instead of just IDs
    const [records] = await this.db
      .select({
        id: marketing_banners.id,
        title: marketing_banners.headline,
        subtitle: marketing_banners.sub_headline,
        image_url: marketing_banners.image_url,
        placement: marketing_banners.placement,
        status: marketing_banners.is_active,
        start_date: marketing_banners.valid_from,
        end_date: marketing_banners.valid_to,
        // target_segment_id: customer_segments.id,
        // target_segment_name: customer_segments.name,
        promotion_id: marketing_banners.promotion_id,
        promotion_name: promotions.name,
        // segment_name: customer_segments.name, // Uncomment if customer_segments is in your schema
      })
      .from(marketing_banners)
      .leftJoin(promotions, eq(marketing_banners.promotion_id, promotions.id))
      // .leftJoin(
      //   customer_segments,
      //   eq(marketing_banners.id, customer_segments),
      // )
      .where(
        and(
          eq(marketing_banners.id, bannerId),
          eq(marketing_banners.company_id, companyId),
        ),
      )
      .limit(1)
      .catch((err) => {
        throw new InternalServerErrorException(
          BannersErrorKeyEnum.FAILED_TO_FETCH_BANNER_DETAILS,
          {
            cause: err,
          },
        );
      });

    if (!records.id) {
      throw new NotFoundException(BannersErrorKeyEnum.BANNER_NOT_FOUND);
    }

    return records;
  }

  // ─── 2. CALCULATE BANNER & PROMOTION ANALYTICS ─────────────
  async getBannerAnalytics(bannerId: string, domain: string) {
    const companyId = await this.resolveCompanyId(domain);

    // Step A: Get the banner to find its linked promotion
    const banner = await this.db.query.marketing_banners.findFirst({
      where: and(
        eq(marketing_banners.id, bannerId),
        eq(marketing_banners.company_id, companyId),
      ),
      columns: { id: true, promotion_id: true },
    });

    if (!banner) throw new NotFoundException(BannersErrorKeyEnum.BANNER_NOT_FOUND);

    // Default empty analytics object
    const analytics = {
      views: 0,
      clicks: 0,
      conversions: 0,
      revenue_generated: 0,
      ctr: 0,
      cvr: 0,
    };

    // If the banner is informational (no promo), we can only return views/clicks
    if (!banner.promotion_id) {
      // You would query banner clicks here if tracked separately.
      // For this example, we return empty/zeros if no promotion is linked.
      return { success: true, data: analytics };
    }

    // Step B: Aggregate Events from `promotion_analytics_events`
    // We group by event_type (e.g., 'VIEW', 'CLICK', 'CONVERSION')
    const eventStats = await this.db
      .select({
        eventType: promotion_analytics_events.event_type,
        count: sql<number>`cast(count(*) as integer)`,
      })
      .from(promotion_analytics_events)
      .where(
        and(
          eq(promotion_analytics_events.promotion_id, banner.promotion_id),
          eq(promotion_analytics_events.company_id, companyId),
        ),
      )
      .groupBy(promotion_analytics_events.event_type);

    // Step B2: Get revenue from promotion_usage (sum of discount_amount)
    const [revenueData] = await this.db
      .select({
        totalRevenue: sql<number>`coalesce(sum(${promotion_usage.discount_amount}), 0)`,
      })
      .from(promotion_usage)
      .where(
        and(
          eq(promotion_usage.promotion_id, banner.promotion_id),
          eq(promotion_usage.company_id, companyId),
        ),
      );

    // Step C: Map Database Results to KPIs
    eventStats.forEach((stat) => {
      // Ensure the string cases match your `PromoEventType` Enum in Drizzle (which are lowercase)
      const type: PromoEventType =
        stat.eventType.toLowerCase() as PromoEventType;

      if (type === PromoEventType.VIEWED) {
        analytics.views = Number(stat.count);
      } else if (type === PromoEventType.CLICKED) {
        analytics.clicks = Number(stat.count);
      } else if (type === PromoEventType.REDEEMED) {
        analytics.conversions = Number(stat.count);
      }
    });

    analytics.revenue_generated = Number(revenueData?.totalRevenue ?? 0);

    // Step D: Calculate Funnel Math (CTR and CVR)
    if (analytics.views > 0) {
      analytics.ctr = (analytics.clicks / analytics.views) * 100;
    }

    if (analytics.clicks > 0) {
      analytics.cvr = (analytics.conversions / analytics.clicks) * 100;
    }

    return {
      views: analytics.views,
      clicks: analytics.clicks,
      conversions: analytics.conversions,
      revenue_generated: Number(analytics.revenue_generated.toFixed(2)),
      ctr: Number(analytics.ctr.toFixed(2)),
      cvr: Number(analytics.cvr.toFixed(2)),
    };
  }
  async create(
    dto: CreateBannerDto,
    domain: string,
    userId: string,
    files: {
      image_url: Express.Multer.File[];
      image_url_mobile?: Express.Multer.File[];
    },
  ) {
    try {
      const companyId = await this.resolveCompanyId(domain);

      let imageUrl = '';
      if (files.image_url[0]) {
        await this.uploadToCloudService
          .uploadBanner(
            files.image_url[0]?.buffer,
            files.image_url[0].originalname,
          )
          .then((data) => (imageUrl = data));
      }
      let imageUrlMobile: string | null = null;
      if (files.image_url_mobile && files.image_url_mobile[0]) {
        await this.uploadToCloudService
          .uploadBanner(
            files.image_url_mobile[0]?.buffer,
            files.image_url_mobile[0].originalname,
          )
          .then((data) => (imageUrlMobile = data));
      }
      const [banner] = await this.db
        .insert(marketing_banners)
        .values({
          company_id: companyId,
          created_by: userId,
          placement: dto.placement as BannerPlacement,
          image_url: imageUrl,
          image_url_mobile: imageUrlMobile ?? undefined,
          image_alt_text: dto.image_alt_text ?? null,
          headline: dto.headline ?? null,
          sub_headline: dto.sub_headline ?? null,
          cta_label: dto.cta_label ?? null,
          cta_url: dto.cta_url ?? null,
          valid_from: dto.valid_from ? new Date(dto.valid_from) : null,
          valid_to: dto.valid_to ? new Date(dto.valid_to) : null,
          display_order: dto.display_order ?? 0,
          promotion_id: dto.promotion_id ?? null,
          is_active: dto.is_active ?? true,
        })
        .returning()
        .catch((err) => {
          throw new InternalServerErrorException(BannersErrorKeyEnum.FAILED_TO_CREATE_BANNER, {
            cause: err,
          });
        });

      return banner;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(BannersErrorKeyEnum.FAILED_TO_CREATE_BANNER, {
        cause: error,
      });
    }
  }

  async update(id: string, dto: Partial<CreateBannerDto>, domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const patch: Record<string, unknown> = {};
      const fields: (keyof CreateBannerDto)[] = [
        'placement',

        'image_alt_text',
        'headline',
        'sub_headline',
        'cta_label',
        'cta_url',
        'display_order',
        'promotion_id',
        'is_active',
      ];
      for (const f of fields) {
        if (dto[f] !== undefined) patch[f] = dto[f];
      }
      if (dto.valid_from) patch.valid_from = new Date(dto.valid_from);
      if (dto.valid_to) patch.valid_to = new Date(dto.valid_to);

      const [updated] = await this.db
        .update(marketing_banners)
        .set(patch)
        .where(
          and(
            eq(marketing_banners.id, id),
            eq(marketing_banners.company_id, companyId),
          ),
        )
        .returning()
        .catch((err) => {
          throw new InternalServerErrorException(BannersErrorKeyEnum.FAILED_TO_UPDATE_BANNER, {
            cause: err,
          });
        });
      if (!updated) throw new NotFoundException(BannersErrorKeyEnum.BANNER_NOT_FOUND);
      return { success: true, data: updated };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(BannersErrorKeyEnum.FAILED_TO_UPDATE_BANNER, {
        cause: error,
      });
    }
  }

  async remove(id: string, domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      await this.db
        .delete(marketing_banners)
        .where(
          and(
            eq(marketing_banners.id, id),
            eq(marketing_banners.company_id, companyId),
          ),
        )
        .catch((err) => {
          throw new InternalServerErrorException(BannersErrorKeyEnum.FAILED_TO_DELETE_BANNER, {
            cause: err,
          });
        });
      return { success: true, message: 'Banner deleted' };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(BannersErrorKeyEnum.FAILED_TO_DELETE_BANNER, {
        cause: error,
      });
    }
  }
}
