import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { DRIZZLE, type DrizzleService } from 'src/drizzle/drizzle.module';
import { and, eq, or } from 'drizzle-orm';
import { company, coupon_usage, coupons } from 'src/drizzle/schema';

@Injectable()
export class CouponService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleService) {}
  async verifyCoupon(code: string, userId: string, domain: string) {
    try {
      const [companyRecord] = await this.db
        .select({ id: company.id })
        .from(company)
        .where(or(eq(company.company_domain, domain), eq(company.id, domain)))
        .limit(1);
      console.log('coupon verifying');
      const couponRecord = await this.db
        .select()
        .from(coupons)
        .where(
          and(
            eq(coupons.code, code),
            eq(coupons.company_id, companyRecord.id),
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
  //   create(createCouponDto: CreateCouponDto) {
  //     return 'This action adds a new coupon';
  //   }

  //   findAll() {
  //     return `This action returns all coupon`;
  //   }

  //   findOne(id: number) {
  //     return `This action returns a #${id} coupon`;
  //   }
  // 1
  //   update(id: number, updateCouponDto: UpdateCouponDto) {
  //     return `This action updates a #${id} coupon`;
  //   }

  //   remove(id: number) {
  //     return `This action removes a #${id} coupon`;
  //   }
}
