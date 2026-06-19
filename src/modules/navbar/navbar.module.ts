import { Module } from '@nestjs/common';
import { NavbarService } from './navbar.service';
import { NavbarController } from './navbar.controller';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { CompanyModule } from '../company/company.module';
import { SiteMapsModule } from '../site-maps/site-maps.module';

@Module({
  imports: [DrizzleModule, CompanyModule, SiteMapsModule],
  controllers: [NavbarController],
  providers: [NavbarService],
  exports: [NavbarService],
})
export class NavbarModule {}
