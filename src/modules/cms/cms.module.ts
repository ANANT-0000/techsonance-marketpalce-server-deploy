import { Module } from '@nestjs/common';
import { CmsController } from './cms.controller';
import { CmsService } from './cms.service';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { CompanyModule } from '../company/company.module';
import { UploadToCloudModule } from '../../utils/upload-to-cloud/upload-to-cloud.module';

@Module({
  imports: [DrizzleModule, CompanyModule, UploadToCloudModule],
  controllers: [CmsController],
  providers: [CmsService],
  exports: [CmsService],
})
export class CmsModule {}
