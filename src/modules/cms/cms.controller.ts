import { Controller, Get, Post, Body, Param, Query, Headers, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CmsService } from './cms.service';
import { CreateCmsDto } from './dto/create-cms.dto';
import { UploadToCloudService } from '../../utils/upload-to-cloud/upload-to-cloud.service';

@Controller({ version: '1', path: 'cms' })
export class CmsController {
  constructor(
    private readonly cmsService: CmsService,
    private readonly uploadService: UploadToCloudService,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadCmsImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No image file provided.');
    }
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file format. Only JPG, PNG, WEBP, and GIF are allowed.');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('File size exceeds 5MB limit.');
    }
    const result = await this.uploadService.uploadFile(file);
    return {
      success: true,
      secure_url: result.secure_url,
    };
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
