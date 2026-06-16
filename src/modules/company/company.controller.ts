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
import { CompanyService } from './company.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RoleGuard } from '../../guards/role.guard';
import { Role } from '../../enums/role.enum';
import { Roles } from '../../common/decorators/roles.decorator';
import { VendorsService } from '../vendors/vendors.service';
import { COMPANY_CONTROLLER_MESSAGES } from './constants/company.constants';
import { CreateAddressDto } from '../address/dto/createAddress.dto';
import { Public } from '../../common/decorators/public.decorator';

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
