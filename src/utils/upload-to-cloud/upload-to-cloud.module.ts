import { forwardRef, Module } from '@nestjs/common';
import { UploadToCloudService } from './upload-to-cloud.service.js';
import { UploadToCloudController } from './upload-to-cloud.controller.js';
import { CloudinaryModule } from '../cloudinary/cloudinary.module.js';
import { CompanyModule } from '../../modules/company/company.module.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';

@Module({
  imports: [CloudinaryModule, forwardRef(() => CompanyModule), DrizzleModule],
  controllers: [UploadToCloudController],
  providers: [UploadToCloudService],
  exports: [UploadToCloudService],
})
export class UploadToCloudModule {}
