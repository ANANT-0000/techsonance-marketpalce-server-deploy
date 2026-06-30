import { Module } from '@nestjs/common';
import { BannersService } from './banners.service.js';
import { BannersController } from './banners.controller.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';
import { CompanyModule } from '../company/company.module.js';
import { UploadToCloudModule } from '../../utils/upload-to-cloud/upload-to-cloud.module.js';

@Module({
  imports: [DrizzleModule, CompanyModule, UploadToCloudModule],
  controllers: [BannersController],
  providers: [BannersService],
})
export class BannersModule {}
