import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  UseInterceptors,
  UploadedFile,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CmsService } from './cms.service.js';
import { CreateCmsDto } from './dto/create-cms.dto.js';
import { CmsLanguageEnum } from './constants/cms.enums.js';
import {
  IS_PUBLIC_KEY,
  Public,
} from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../enums/role.enum.js';
import { RoleGuard } from '../../guards/role.guard.js';

@Controller({ version: '1', path: 'cms' })
export class CmsController {
  constructor(private readonly cmsService: CmsService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadCmsImage(@UploadedFile() file: Express.Multer.File) {
    return this.cmsService.uploadCmsImage(file);
  }
  @Public()
  @Get(':type')
  getPage(
    @Headers('company-domain') domain: string,
    @Param('type') type: string,
    @Query('lang') lang?: string,
  ) {
    return this.cmsService.getPage(
      domain,
      type,
      (lang as CmsLanguageEnum) || CmsLanguageEnum.ENGLISH,
    );
  }

  @Post()
  upsertPage(
    @Headers('company-domain') domain: string,
    @Body() dto: CreateCmsDto,
  ) {
    return this.cmsService.upsertPage(domain, dto);
  }
  @Delete('delete-cloudinary-image')
  @UseGuards(RoleGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
  async deleteCloudinaryImage(
    @Headers('company-domain') domain: string,
    @Query('url') url: string,
  ) {
    return this.cmsService.deleteCloudinaryImage(domain, url);
  }
}
