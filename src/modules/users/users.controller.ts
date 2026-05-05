import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { RoleGuard } from 'src/guards/role.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/enums/role.enum';
import { UserStatus } from 'src/drizzle/types/types';

@Controller({ version: '1', path: 'users' })
export class UsersController {
  constructor(private readonly userService: UsersService) { }
  @Get('/:id')
  @HttpCode(HttpStatus.OK)
  async getProfile(@Param('id') userId: string) {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }
  @Post(':customer_id/deactivate')
  async deactivateCustomer(@Param('customer_id') customer_id: string, @Headers('company-domain') domain: string) {
    console.log('deactivate customer', customer_id, domain);
    return this.userService.initializeAccountActionOtp(domain, UserStatus.INACTIVE, customer_id, undefined);
  }
  @Post('reactivate')
  async reactivateCustomer(@Body('email') email: string, @Headers('company-domain') domain: string) {
    console.log('reactivate customer', email, domain);
    return this.userService.initializeAccountActionOtp(domain, UserStatus.ACTIVE, undefined, email);
  }
  @Patch(':customer_id/deactivate/confirm')
  async confirmAccountDeactivation(@Param('customer_id') customer_id: string, @Body('otp') otp: string, @Headers('company-domain') domain: string) {
    return this.userService.confirmAccountAction(domain, UserStatus.INACTIVE, otp, customer_id, undefined);
  }
  @Patch('reactivate/confirm')
  async confirmAccountReactivation(@Body() body: { otp: string, email: string }, @Headers('company-domain') domain: string) {
    console.log('confirm account reactivation', body, domain);
    return this.userService.confirmAccountAction(domain, UserStatus.ACTIVE, body.otp, undefined, body.email);
  }

}
