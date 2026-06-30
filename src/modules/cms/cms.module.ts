import { Module } from '@nestjs/common';
import { CmsController } from './cms.controller.js';
import { CmsService } from './cms.service.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';
import { CompanyModule } from '../company/company.module.js';
import { UploadToCloudModule } from '../../utils/upload-to-cloud/upload-to-cloud.module.js';

@Module({
  imports: [DrizzleModule, CompanyModule, UploadToCloudModule],
  controllers: [CmsController],
  providers: [CmsService],
  exports: [CmsService],
})
export class CmsModule {}
