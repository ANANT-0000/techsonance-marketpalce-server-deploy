import { Controller, Get, Headers, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { Request } from 'express';
import { CompanyService } from './company.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RoleGuard } from 'src/guards/role.guard';
import { Role } from 'src/enums/role.enum';
import { Roles } from 'src/common/decorators/roles.decorator';

@Controller({ version: '1', path: 'company' })
export class CompanyController {
    constructor(
        private readonly companyService: CompanyService,
        private readonly usersService: UsersService,
    ) { }

    @Get('customers')
    @UseGuards(JwtAuthGuard, RoleGuard)
    @Roles(Role.ADMIN, Role.VENDOR)
    async getCustomers(@Headers('company-domain') domain: string) {
        return this.usersService.listCustomersByDomain(domain);
    }

    @Get()
    @UseGuards(JwtAuthGuard, RoleGuard)
    @Roles(Role.ADMIN)
    async getCompanyLists() {
        return this.companyService.listCompanies();
    }

    @Patch(':company_id/suspend')
    @UseGuards(JwtAuthGuard, RoleGuard)
    @Roles(Role.ADMIN)
    async suspendCompany(@Param('company_id') company_id: string) {
        return this.companyService.suspendCompany(company_id);
    }

}
