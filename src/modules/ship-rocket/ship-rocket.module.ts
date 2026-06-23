import { Module } from '@nestjs/common';
import { ShipRocketService } from './ship-rocket.service';
import { ShipRocketController } from './ship-rocket.controller';

@Module({
  controllers: [ShipRocketController],
  providers: [ShipRocketService],
  exports: [ShipRocketService],
})
export class ShipRocketModule {}
