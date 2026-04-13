import { Module } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CheckoutController } from './checkout.controller';
import { CouponModule } from '../coupon/coupon.module';
import { DrizzleModule } from 'src/drizzle/drizzle.module';

@Module({
  imports: [CouponModule, DrizzleModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
