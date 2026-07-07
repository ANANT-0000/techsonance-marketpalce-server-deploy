import { Module } from '@nestjs/common';
import { LandingPageController } from './landing-page.controller.js';
import { LandingPageService } from './landing-page.service.js';
import { CompanyModule } from '../company/company.module.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';

@Module({
  imports: [CompanyModule, DrizzleModule],
  controllers: [LandingPageController],
  providers: [LandingPageService],
  exports: [LandingPageService],
})
export class LandingPageModule {}
