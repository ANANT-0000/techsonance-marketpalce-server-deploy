import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { CompanyModule } from '../company/company.module';
import { InventoryModule } from '../inventory/inventory.module';
import { MailModule } from '../../common/services/mail/mail.module';
import { InvoiceModule } from '../invoice/invoice.module';
import { FinancesModule } from '../finances/finances.module';
import { ProductPoliciesModule } from '../product-policies/product-policies.module';

@Module({
  imports: [
    DrizzleModule,
    CompanyModule,
    InventoryModule,
    MailModule,
    InvoiceModule,
    FinancesModule,
    ProductPoliciesModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
