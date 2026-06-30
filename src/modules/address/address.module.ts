import { Module } from '@nestjs/common';
import { AddressService } from './address.service.js';
import { AddressController } from './address.controller.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';
import { CompanyModule } from '../company/company.module.js';

@Module({
  imports: [DrizzleModule, CompanyModule],
  controllers: [AddressController],
  providers: [AddressService],
  exports: [AddressService],
})
export class AddressModule {}
