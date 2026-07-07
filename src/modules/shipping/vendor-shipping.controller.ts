import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Req,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { RoleGuard } from '../../guards/role.guard.js';
import { Role } from '../../enums/role.enum.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ShippingService } from './shipping.service.js';

@Controller({
  version: '1',
  path: 'vendor/shipping',
})
@UseGuards(RoleGuard)
@Roles(Role.VENDOR)
export class VendorShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @Get('logistic-companies')
  async getLogisticCompanies() {
    return this.shippingService.getLogisticCompanies();
  }

  @Get('preferences')
  async getPreferences(
    @Req() req: any,
    @Headers('company-domain') companyDomain: string,
  ) {
    return this.shippingService.getVendorPreferences(req.user.id, companyDomain);
  }

  @Patch('preferences')
  async updatePreferences(
    @Req() req: any,
    @Headers('company-domain') companyDomain: string,
    @Body() body: any,
  ) {
    return this.shippingService.upsertVendorPreferences(req.user.id, companyDomain, body);
  }

  @Post('calculate-rates')
  async calculateRates(
    @Req() req: any,
    @Headers('company-domain') companyDomain: string,
    @Body() body: any,
  ) {
    return this.shippingService.calculateTestRates(req.user.id, companyDomain, body);
  }
}
