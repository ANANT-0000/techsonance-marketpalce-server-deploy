import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { Request } from 'express';
import { CompanyService } from './company.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RoleGuard } from '../../guards/role.guard';
import { Role } from '../../enums/role.enum';
import { Roles } from '../../common/decorators/roles.decorator';
import { VendorsService } from '../vendors/vendors.service';

@Controller({ version: '1', path: 'company' })
export class CompanyController {
  constructor(
    private readonly companyService: CompanyService,
    private readonly usersService: UsersService,
    private readonly vendorService: VendorsService,
  ) {}

  @Patch(':company_id/suspend')
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(Role.ADMIN)
  async suspendCompany(@Param('company_id') company_id: string) {
    return this.companyService.suspendCompany(company_id);
  }
  @Post('address')
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(Role.VENDOR, Role.ADMIN)
  async addCompanyAddress(
    @Headers('company-domain') domain: string,
    @Body() payload: any,
  ) {
    return this.vendorService.createRegistrationAddress(domain, payload);
  }
  @Get('address')
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(Role.VENDOR, Role.ADMIN)
  async getCompanyAddresses(@Headers('company-domain') domain: string) {
    return this.vendorService.getCompanyAddresses(domain);
  }
}
