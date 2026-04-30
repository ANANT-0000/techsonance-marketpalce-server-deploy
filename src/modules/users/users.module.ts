import { Module } from '@nestjs/common';
import { DrizzleModule } from 'src/drizzle/drizzle.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { JwtModule } from '@nestjs/jwt';
import { MailModule } from 'src/common/services/mail/mail.module';
import { CompanyModule } from '../company/company.module';

@Module({
  imports: [DrizzleModule, JwtModule, MailModule, CompanyModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule { }
