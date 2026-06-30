import { Module } from '@nestjs/common';
import { WarehouseService } from './warehouse.service.js';
import { WarehouseController } from './warehouse.controller.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';
import { CompanyModule } from '../company/company.module.js';
import { ShipRocketModule } from '../ship-rocket/ship-rocket.module.js';
import { ShippingModule } from '../shipping/shipping.module.js';

@Module({
  imports: [DrizzleModule, CompanyModule, ShipRocketModule, ShippingModule],
  controllers: [WarehouseController],
  providers: [WarehouseService],
})
export class WarehouseModule {}
