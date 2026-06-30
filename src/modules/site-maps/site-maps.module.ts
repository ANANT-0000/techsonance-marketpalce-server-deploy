import { Module } from '@nestjs/common';
import { SiteMapsService } from './site-maps.service.js';
import { SiteMapsController } from './site-maps.controller.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';
import { CompanyModule } from '../company/company.module.js';

@Module({
  imports: [DrizzleModule, CompanyModule],
  controllers: [SiteMapsController],
  providers: [SiteMapsService],
  exports: [SiteMapsService],
})
export class SiteMapsModule {}
