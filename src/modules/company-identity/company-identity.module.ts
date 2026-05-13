import { Module } from '@nestjs/common';
import { CompanyIdentityController } from './company-identity.controller';
import { CompanyIdentityService } from './company-identity.service';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { CompanyModule } from '../company/company.module';
import { UploadToCloudModule } from '../../utils/upload-to-cloud/upload-to-cloud.module';

@Module({
  imports: [DrizzleModule, CompanyModule, UploadToCloudModule],
  controllers: [CompanyIdentityController],
  providers: [CompanyIdentityService],
  exports: [CompanyIdentityService],
})
export class CompanyIdentityModule {}
