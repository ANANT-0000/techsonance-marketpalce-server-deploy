import { forwardRef, Module } from '@nestjs/common';
import { CouponService } from './coupon.service';
import { CouponController } from './coupon.controller';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { CompanyModule } from '../company/company.module';

@Module({
  imports: [DrizzleModule, forwardRef(() => CompanyModule)],
  controllers: [CouponController],
  providers: [CouponService],
  exports: [CouponService],
})
export class CouponModule {}
