import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  Param,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../enums/role.enum';
import { RoleGuard } from '../../guards/role.guard';
import { CustomersService } from './customers.service';

@Controller({ version: '1', path: 'customers' })
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(Role.CUSTOMER)
  @Get('dashboard/:user_id')
  @HttpCode(HttpStatus.OK)
  async getDashboardData(
    @Param('user_id') userId,
    @Headers('company-domain') domain: string,
  ) {
    return this.customersService.getDashboardData(userId, domain);
  }
}
