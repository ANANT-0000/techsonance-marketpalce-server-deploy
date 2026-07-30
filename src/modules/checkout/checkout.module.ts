import { Module } from '@nestjs/common';
import { CheckoutService } from './checkout.service.js';
import { CheckoutController } from './checkout.controller.js';
import { CouponModule } from '../coupon/coupon.module.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { CompanyModule } from '../company/company.module.js';
import { MailModule } from '../../common/services/mail/mail.module.js';
import { ShipRocketModule } from '../ship-rocket/ship-rocket.module.js';
import { ShippingModule } from '../shipping/shipping.module.js';
import { PaymentModule } from '../vendors/payment/payment.module.js';
import { CacheModule } from '@nestjs/cache-manager';
import { PricingModule } from '../pricing/pricing.module.js';

@Module({
  imports: [
    CacheModule.register(),
    CouponModule,
    DrizzleModule,
    MailModule,
    OrdersModule,
    CompanyModule,
    ShipRocketModule,
    ShippingModule,
    PaymentModule,
    PricingModule,
  ],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
