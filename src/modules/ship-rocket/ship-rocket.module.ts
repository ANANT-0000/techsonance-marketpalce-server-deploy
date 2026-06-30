import { Module } from '@nestjs/common';
import { ShipRocketService } from './ship-rocket.service.js';
import { ShipRocketController } from './ship-rocket.controller.js';

@Module({
  controllers: [ShipRocketController],
  providers: [ShipRocketService],
  exports: [ShipRocketService],
})
export class ShipRocketModule {}
