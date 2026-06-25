import { Module } from '@nestjs/common';
import { WarehouseService } from './warehouse.service';
import { WarehouseController } from './warehouse.controller';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { CompanyModule } from '../company/company.module';
import { ShipRocketModule } from '../ship-rocket/ship-rocket.module';
import { ShippingModule } from '../shipping/shipping.module';

@Module({
  imports: [DrizzleModule, CompanyModule, ShipRocketModule, ShippingModule],
  controllers: [WarehouseController],
  providers: [WarehouseService],
})
export class WarehouseModule {}
