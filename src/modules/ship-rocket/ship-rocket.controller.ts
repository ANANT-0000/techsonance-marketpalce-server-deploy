import { Controller, Get } from '@nestjs/common';
import { ShipRocketService } from './ship-rocket.service.js';

@Controller('ship-rocket')
export class ShipRocketController {
  constructor(private readonly shipRocketService: ShipRocketService) {}
}
