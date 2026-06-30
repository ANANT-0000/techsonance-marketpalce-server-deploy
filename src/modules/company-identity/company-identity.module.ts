import { Module } from '@nestjs/common';
import { CompanyIdentityController } from './company-identity.controller.js';
import { CompanyIdentityService } from './company-identity.service.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';
import { CompanyModule } from '../company/company.module.js';
import { UploadToCloudModule } from '../../utils/upload-to-cloud/upload-to-cloud.module.js';

@Module({
  imports: [DrizzleModule, CompanyModule, UploadToCloudModule],
  controllers: [CompanyIdentityController],
  providers: [CompanyIdentityService],
  exports: [CompanyIdentityService],
})
export class CompanyIdentityModule {}
