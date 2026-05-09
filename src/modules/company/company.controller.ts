import { Controller, Get, Headers, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { Request } from 'express';
import { CompanyService } from './company.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RoleGuard } from '../../guards/role.guard';
import { Role } from '../../enums/role.enum';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller({ version: '1', path: 'company' })
export class CompanyController {
    constructor(
        private readonly companyService: CompanyService,
        private readonly usersService: UsersService,
    ) { }







    @Patch(':company_id/suspend')
    @UseGuards(JwtAuthGuard, RoleGuard)
    @Roles(Role.ADMIN)
    async suspendCompany(@Param('company_id') company_id: string) {
        return this.companyService.suspendCompany(company_id);
    }

}
