import { Module } from '@nestjs/common';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { JwtModule } from '@nestjs/jwt';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { CompanyModule } from '../company/company.module';

@Module({
  imports: [DrizzleModule, JwtModule, CompanyModule],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}
