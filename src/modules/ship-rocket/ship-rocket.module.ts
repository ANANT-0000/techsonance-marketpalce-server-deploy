import { Module } from '@nestjs/common';
import { ShipRocketService } from './ship-rocket.service.js';
import { ShipRocketController } from './ship-rocket.controller.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';

@Module({
  imports:[DrizzleModule],
  controllers: [ShipRocketController],
  providers: [ShipRocketService],
  exports: [ShipRocketService],
})
export class ShipRocketModule {}
