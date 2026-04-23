import { Module } from '@nestjs/common';
import { OrderItemsService } from './order-items.service';
import { OrderItemsController } from './order-items.controller';
import { MailModule } from 'src/common/services/mail/mail.module';
import { CompanyModule } from '../company/company.module';
import { InventoryModule } from '../inventory/inventory.module';
import { DrizzleModule } from 'src/drizzle/drizzle.module';

@Module({
  imports: [MailModule, CompanyModule, InventoryModule, DrizzleModule],
  controllers: [OrderItemsController],
  providers: [OrderItemsService],
})
export class OrderItemsModule {}
