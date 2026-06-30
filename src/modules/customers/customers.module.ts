import { Module } from '@nestjs/common';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';
import { JwtModule } from '@nestjs/jwt';
import { CustomersController } from './customers.controller.js';
import { CustomersService } from './customers.service.js';
import { CompanyModule } from '../company/company.module.js';

@Module({
  imports: [DrizzleModule, JwtModule, CompanyModule],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}
