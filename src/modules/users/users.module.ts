import { Module } from '@nestjs/common';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { JwtModule } from '@nestjs/jwt';
import { MailModule } from '../../common/services/mail/mail.module.js';
import { CompanyModule } from '../company/company.module.js';

@Module({
  imports: [DrizzleModule, JwtModule, MailModule, CompanyModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
