import { Controller, Get } from '@nestjs/common';
import { ShipRocketService } from './ship-rocket.service';

@Controller('ship-rocket')
export class ShipRocketController {
  constructor(private readonly shipRocketService: ShipRocketService) {}
}
