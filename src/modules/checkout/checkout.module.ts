import { Module } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CheckoutController } from './checkout.controller';
import { CouponModule } from '../coupon/coupon.module';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { OrdersModule } from '../orders/orders.module';
import { CompanyModule } from '../company/company.module';
import { MailModule } from '../../common/services/mail/mail.module';
import { ShipRocketModule } from '../ship-rocket/ship-rocket.module';
import { ShippingModule } from '../shipping/shipping.module';
import { PaymentModule } from '../vendors/payment/payment.module';

@Module({
  imports: [
    CouponModule,
    DrizzleModule,
    MailModule,
    OrdersModule,
    CompanyModule,
    ShipRocketModule,
    ShippingModule,
    PaymentModule,
  ],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
