import { Controller, Get, Post, Body, Param, Query, Headers, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CmsService } from './cms.service';
import { CreateCmsDto } from './dto/create-cms.dto';


@Controller({ version: '1', path: 'cms' })
export class CmsController {
  constructor(
    private readonly cmsService: CmsService,

  ) { }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadCmsImage(@UploadedFile() file: Express.Multer.File) {
    return this.cmsService.uploadCmsImage(file);
  }

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
