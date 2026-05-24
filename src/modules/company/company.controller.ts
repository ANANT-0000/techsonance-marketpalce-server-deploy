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
  Delete,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
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

  // @Post('offers')
  // @UseGuards(JwtAuthGuard, RoleGuard)
  // @Roles(Role.VENDOR, Role.ADMIN)
  // async createOffer(
  //   @Headers('company-domain') domain: string,
  //   @Body() payload: any,
  // ) {
  //   return this.offersService.createOffer(domain, payload);
  // }

  // @Get('offers')
  // async listOffers(@Headers('company-domain') domain: string) {
  //   return this.offersService.listOffers(domain);
  // }

  // @Get('offers/:id')
  // async getOfferDetail(
  //   @Headers('company-domain') domain: string,
  //   @Param('id') id: string,
  // ) {
  //   return this.offersService.getOfferDetail(domain, id);
  // }

  // @Patch('offers/:id')
  // @UseGuards(JwtAuthGuard, RoleGuard)
  // @Roles(Role.VENDOR, Role.ADMIN)
  // async updateOffer(
  //   @Headers('company-domain') domain: string,
  //   @Param('id') id: string,
  //   @Body() payload: any,
  // ) {
  //   return this.offersService.updateOffer(domain, id, payload);
  // }

  // @Delete('offers/:id')
  // @UseGuards(JwtAuthGuard, RoleGuard)
  // @Roles(Role.VENDOR, Role.ADMIN)
  // async deleteOffer(@Headers('company-domain') domain: string, @Param('id') id: string) {
  //   return this.offersService.deleteOffer(domain, id);
  // }

  // @Post('offers/:id/scopes')
  // @UseGuards(JwtAuthGuard, RoleGuard)
  // @Roles(Role.VENDOR, Role.ADMIN)
  // async addScope(
  //   @Headers('company-domain') domain: string,
  //   @Param('id') id: string,
  //   @Body() payload: any,
  // ) {
  //   return this.offersService.addScope(domain, id, payload);
  // }

  // @Delete('offers/:id/scopes/:scopeId')
  // @UseGuards(JwtAuthGuard, RoleGuard)
  // @Roles(Role.VENDOR, Role.ADMIN)
  // async removeScope(
  //   @Headers('company-domain') domain: string,
  //   @Param('id') id: string,
  //   @Param('scopeId') scopeId: string,
  // ) {
  //   return this.offersService.removeScope(domain, id, scopeId);
  // }

  // @Patch('offers/:id/display')
  // @UseGuards(JwtAuthGuard, RoleGuard)
  // @Roles(Role.VENDOR, Role.ADMIN)
  // async updateDisplay(
  //   @Headers('company-domain') domain: string,
  //   @Param('id') id: string,
  //   @Body() payload: any,
  // ) {
  //   return this.offersService.updateDisplay(domain, id, payload);
  // }

  // @Get('offers/:id/overlap-check')
  // async overlapCheck(@Headers('company-domain') domain: string, @Param('id') id: string) {
  //   return this.offersService.overlapCheck(domain, id);
  // }
}
