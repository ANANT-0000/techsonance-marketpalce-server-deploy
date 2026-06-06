import { Module } from '@nestjs/common';
import { HelpArticlesService } from './help-articles.service';
import { HelpArticlesController } from './help-articles.controller';
import { CompanyModule } from '../company/company.module';

@Module({
  imports: [CompanyModule],
  controllers: [HelpArticlesController],
  providers: [HelpArticlesService],
  exports: [HelpArticlesService],
})
export class HelpArticlesModule {}
