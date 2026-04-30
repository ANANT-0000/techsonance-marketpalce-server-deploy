import { Controller, Get, Headers, Query, UseGuards } from '@nestjs/common';
import { FinancesService } from './finances.service';

@Controller({ version: '1', path: 'finances' })
// @UseGuards(VendorAuthGuard)
export class FinancesController {
  constructor(private readonly financesService: FinancesService) { }

  @Get('earnings')
  async getVendorEarnings(
    @Headers('company-domain') domain: string,
  ) {
    return this.financesService.getVendorEarnings(domain);
  }
}
