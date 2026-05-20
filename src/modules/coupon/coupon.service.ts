import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import { and, eq } from 'drizzle-orm';
import { coupon_products, coupon_usage, coupons } from '../../drizzle/schema';
import { CompanyService } from '../company/company.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { CreateCouponDTO } from './dto/coupon.dto';

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
        .limit(1);
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
        .limit(1);
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
  async createCoupon(dto: CreateCouponDTO, domain: string) {
    const companyId = await this.resolveCompanyId(domain);
    if (!companyId) {
      throw new InternalServerErrorException(
        `Company with domain ${domain} not found`,
      );
    }
    return await this.db.transaction(async (tx) => {
      if (!dto.is_auto_applied && dto.code) {
        const existingCoupon = await tx
          .select()
          .from(coupons)
          .where(
            and(
              eq(coupons.company_id, companyId),
              eq(coupons.code, dto.code.toUpperCase()),
            ),
          );

        if (existingCoupon) {
          throw new Error(
            `Coupon code ${dto.code} already exists for this company.`,
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
          valid_from: dto.valid_from,
          valid_to: dto.valid_to,
          company_id: companyId,
        })
        .returning();
      if (dto.applicable_product_ids && dto.applicable_product_ids.length > 0) {
        const productLinks = dto.applicable_product_ids.map((productId) => ({
          coupon_id: newCoupon.id,
          product_id: productId,
        }));
        await tx.insert(coupon_products).values(productLinks);
      }

      return newCoupon;
    });
  }
}
