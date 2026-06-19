import { Module } from '@nestjs/common';
import { SiteMapsService } from './site-maps.service';
import { SiteMapsController } from './site-maps.controller';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { CompanyModule } from '../company/company.module';

@Module({
  imports: [DrizzleModule, CompanyModule],
  controllers: [SiteMapsController],
  providers: [SiteMapsService],
  exports: [SiteMapsService],
})
export class SiteMapsModule {}
