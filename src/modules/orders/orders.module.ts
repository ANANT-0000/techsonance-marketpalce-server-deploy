import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { DrizzleModule } from 'src/drizzle/drizzle.module';
import { CompanyModule } from '../company/company.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [DrizzleModule, CompanyModule, InventoryModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
