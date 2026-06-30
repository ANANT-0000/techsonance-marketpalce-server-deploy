import { forwardRef, Module } from '@nestjs/common';
import { CouponService } from './coupon.service.js';
import { CouponController } from './coupon.controller.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';
import { CompanyModule } from '../company/company.module.js';

@Module({
  imports: [DrizzleModule, forwardRef(() => CompanyModule)],
  controllers: [CouponController],
  providers: [CouponService],
  exports: [CouponService],
})
export class CouponModule {}
