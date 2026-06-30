import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  UseGuards,
  Param,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../enums/role.enum.js';
import { RoleGuard } from '../../guards/role.guard.js';
import { CustomersService } from './customers.service.js';

@Controller({ version: '1', path: 'customers' })
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(Role.CUSTOMER)
  @Get('dashboard/:user_id')
  @HttpCode(HttpStatus.OK)
  async getDashboardData(
    @Param('user_id') userId: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.customersService.getDashboardData(userId, domain);
  }
}
