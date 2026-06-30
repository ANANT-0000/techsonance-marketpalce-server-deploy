import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CompanyService } from './company.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RoleGuard } from '../../guards/role.guard.js';
import { Role } from '../../enums/role.enum.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { VendorsService } from '../vendors/vendors.service.js';
import { COMPANY_CONTROLLER_MESSAGES } from './constants/company.constants.js';
import { CreateAddressDto } from '../address/dto/createAddress.dto.js';
import { Public } from '../../common/decorators/public.decorator.js';

@Controller({ version: '1', path: 'company' })
export class CompanyController {
  constructor(
    private readonly companyService: CompanyService,
    private readonly vendorService: VendorsService,
  ) {}
  @Public()
  @Get()
  test() {
    return COMPANY_CONTROLLER_MESSAGES.HEALTH_CHECK;
  }
  @Public()
  @Get('profile')
  // @UseGuards(JwtAuthGuard)
  // @Roles(Role.VENDOR, Role.ADMIN)
  async getCompanyProfile(@Headers('company-domain') domain: string) {
    return this.companyService.findProfile(domain);
  }

  @Patch(':company_id/suspend')
  @UseGuards(RoleGuard)
  @Roles(Role.ADMIN)
  async suspendCompany(@Param('company_id') company_id: string) {
    return this.companyService.suspendCompany(company_id);
  }
  @Post('address')
  @UseGuards(RoleGuard)
  @Roles(Role.VENDOR, Role.ADMIN)
  async addCompanyAddress(
    @Headers('company-domain') domain: string,
    @Body() payload: CreateAddressDto,
  ) {
    return this.vendorService.createRegistrationAddress(domain, payload);
  }
  @Get('address')
  @UseGuards(RoleGuard)
  @Roles(Role.VENDOR, Role.ADMIN)
  async getCompanyAddresses(@Headers('company-domain') domain: string) {
    return this.vendorService.getCompanyAddresses(domain);
  }
}
