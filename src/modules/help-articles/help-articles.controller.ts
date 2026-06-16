import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { HelpArticlesService } from './help-articles.service';
import { Public } from '../../common/decorators/public.decorator';

@Controller({ version: '1', path: 'help-articles' })
export class HelpArticlesController {
  constructor(private readonly helpArticlesService: HelpArticlesService) {}

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  async getArticles(
    @Headers('company-domain') domain: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    return this.helpArticlesService.getArticles(domain, category, search);
  }

  @Public()
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getArticleById(@Param('id') id: string) {
    return this.helpArticlesService.getArticleById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createArticle(
    @Headers('company-domain') domain: string,
    @Body()
    articleData: {
      title: string;
      content: string;
      category: string;
      order_index?: number;
    },
  ) {
    return this.helpArticlesService.createArticle(domain, articleData);
  }

  @Post(':id/vote')
  @HttpCode(HttpStatus.OK)
  async voteArticle(@Param('id') id: string, @Body('isHelpful') isHelpful: boolean) {
    return this.helpArticlesService.voteArticle(id, isHelpful);
  }
}
