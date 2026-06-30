import { Module, forwardRef } from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import { OrdersController } from './orders.controller.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';
import { CompanyModule } from '../company/company.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { MailModule } from '../../common/services/mail/mail.module.js';
import { InvoiceModule } from '../invoice/invoice.module.js';
import { FinancesModule } from '../finances/finances.module.js';
import { ProductPoliciesModule } from '../product-policies/product-policies.module.js';
import { CouponModule } from '../coupon/coupon.module.js';
import { PromotionsModule } from '../promotions/promotions.module.js';
import { ShippingModule } from '../shipping/shipping.module.js';
import { OutboxModule } from '../outbox/outbox.module.js';
import { PolicyResolutionService } from '../product-policies/policy-resolution.service.js';

@Module({
  imports: [
    DrizzleModule,
    forwardRef(() => CompanyModule),
    InventoryModule,
    MailModule,
    InvoiceModule,
    FinancesModule,
    ProductPoliciesModule,
    CouponModule,
    PromotionsModule,
    ShippingModule,
    OutboxModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, PolicyResolutionService],
  exports: [OrdersService],
})
export class OrdersModule {}
