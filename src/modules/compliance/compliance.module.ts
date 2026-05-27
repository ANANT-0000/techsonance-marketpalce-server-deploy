import { Module } from '@nestjs/common';
import { ComplianceService } from './compliance.service';
import { ComplianceController } from './compliance.controller';
import { CompanyModule } from '../company/company.module';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { UploadToCloudModule } from '../../utils/upload-to-cloud/upload-to-cloud.module';

@Module({
  imports: [CompanyModule, DrizzleModule, UploadToCloudModule],
  controllers: [ComplianceController],
  providers: [ComplianceService],
})
export class ComplianceModule {}
