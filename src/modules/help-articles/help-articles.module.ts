import { Module } from '@nestjs/common';
import { HelpArticlesService } from './help-articles.service.js';
import { HelpArticlesController } from './help-articles.controller.js';
import { CompanyModule } from '../company/company.module.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';

@Module({
  imports: [CompanyModule, DrizzleModule],
  controllers: [HelpArticlesController],
  providers: [HelpArticlesService],
  exports: [HelpArticlesService],
})
export class HelpArticlesModule {}
