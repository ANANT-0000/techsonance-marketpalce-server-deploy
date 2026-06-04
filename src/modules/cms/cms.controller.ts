import { Controller, Get, Post, Body, Param, Query, Headers } from '@nestjs/common';
import { CmsService } from './cms.service';
import { CreateCmsDto } from './dto/create-cms.dto';

@Controller({ version: '1', path: 'cms' })
export class CmsController {
  constructor(private readonly cmsService: CmsService) {}

  @Get(':type')
  getPage(
    @Headers('company-domain') domain: string,
    @Param('type') type: string,
    @Query('lang') lang?: string,
  ) {
    return this.cmsService.getPage(domain, type, lang || 'en');
  }

  @Post()
  upsertPage(
    @Headers('company-domain') domain: string,
    @Body() dto: CreateCmsDto,
  ) {
    return this.cmsService.upsertPage(domain, dto);
  }
}
