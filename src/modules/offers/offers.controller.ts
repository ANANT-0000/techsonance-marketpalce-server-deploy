import { Controller, Get, Headers } from '@nestjs/common';
import { OffersService } from './offers.service';

@Controller({ version: '1', path: 'offers' })
export class OffersController {
  constructor(private readonly offersService: OffersService) {}
  @Get()
  async getOffersAll(@Headers('company-domain') domain: string) {
    return this.offersService.getOffersAll(domain);
  }
}
