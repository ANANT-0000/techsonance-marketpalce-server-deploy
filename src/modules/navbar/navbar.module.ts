import { Module } from '@nestjs/common';
import { NavbarService } from './navbar.service.js';
import { NavbarController } from './navbar.controller.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';
import { CompanyModule } from '../company/company.module.js';
import { SiteMapsModule } from '../site-maps/site-maps.module.js';

@Module({
  imports: [DrizzleModule, CompanyModule, SiteMapsModule],
  controllers: [NavbarController],
  providers: [NavbarService],
  exports: [NavbarService],
})
export class NavbarModule {}
