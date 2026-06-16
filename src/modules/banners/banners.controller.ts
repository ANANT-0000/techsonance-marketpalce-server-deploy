// ../../modules/banners/banners.controller.ts

import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
} from '@nestjs/common';
import { BannersService } from './banners.service';
import { BannerPlacement } from '../../drizzle/types/types';
import { UploadToCloud } from '../../common/decorators/upload.decorator';
import { CreateBannerDto } from './dto/banner.dto';
import { ParseJsonPipe } from '../../common/pipes/parseJsonPipe';
import { Public } from '../../common/decorators/public.decorator';

@Controller({ version: '1', path: 'banners' })
export class BannersController {
  constructor(private readonly bannersService: BannersService) {}

  @Get()
  findAll(@Headers('company-domain') domain: string) {
    return this.bannersService.findAll(domain);
  }

  // Storefront call: GET /v1/banners/active?placement=homepage_hero
  @Public()
  @Get('active')
  findActive(
    @Headers('company-domain') domain: string,
    @Query('placement') placement: BannerPlacement,
  ) {
    return this.bannersService.findActive(domain, placement);
  }
  @Get(':bannerId')
  async getBannerDetails(
    @Param('bannerId') bannerId: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.bannersService.getBannerDetails(bannerId, domain);
  }

  @Get('analytics/:bannerId')
  async getBannerAnalytics(
    @Param('bannerId') bannerId: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.bannersService.getBannerAnalytics(bannerId, domain);
  }
  @Post(':userId')
  @UploadToCloud([
    { name: 'image_url', maxCount: 1 },
    { name: 'image_url_mobile', maxCount: 1 },
  ])
  create(
    @Param('userId') userId: string,
    @Body('formData', ParseJsonPipe) dto: CreateBannerDto,
    @Headers('company-domain') domain: string,
    @UploadedFiles() files: any,
  ) {
    return this.bannersService.create(dto, domain, userId, files);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateBannerDto>,
    @Headers('company-domain') domain: string,
  ) {
    return this.bannersService.update(id, dto, domain);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Headers('company-domain') domain: string) {
    return this.bannersService.remove(id, domain);
  }
}
