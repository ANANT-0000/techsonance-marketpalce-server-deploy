import { Module } from '@nestjs/common';
import { HelpArticlesService } from './help-articles.service';
import { HelpArticlesController } from './help-articles.controller';
import { CompanyModule } from '../company/company.module';
import { DrizzleModule } from '../../drizzle/drizzle.module';

@Module({
  imports: [CompanyModule, DrizzleModule],
  controllers: [HelpArticlesController],
  providers: [HelpArticlesService],
  exports: [HelpArticlesService],
})
export class HelpArticlesModule {}
