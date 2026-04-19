import { Module } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CheckoutController } from './checkout.controller';
import { CouponModule } from '../coupon/coupon.module';
import { DrizzleModule } from 'src/drizzle/drizzle.module';
import { OrdersModule } from '../orders/orders.module';
import { CompanyModule } from '../company/company.module';

@Module({
  imports: [CouponModule, DrizzleModule, OrdersModule, CompanyModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
