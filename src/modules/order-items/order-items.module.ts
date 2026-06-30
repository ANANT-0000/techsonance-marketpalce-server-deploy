import { Module } from '@nestjs/common';
import { OrderItemsService } from './order-items.service.js';
import { OrderItemsController } from './order-items.controller.js';
import { MailModule } from '../../common/services/mail/mail.module.js';
import { CompanyModule } from '../company/company.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';
import { ProductPoliciesModule } from '../product-policies/product-policies.module.js';

@Module({
  imports: [
    MailModule,
    CompanyModule,
    InventoryModule,
    DrizzleModule,
    ProductPoliciesModule,
  ],
  controllers: [OrderItemsController],
  providers: [OrderItemsService],
})
export class OrderItemsModule {}
