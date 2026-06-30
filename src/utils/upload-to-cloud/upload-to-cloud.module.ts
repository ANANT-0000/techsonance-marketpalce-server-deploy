import { Module } from '@nestjs/common';
import { UploadToCloudService } from './upload-to-cloud.service.js';
import { UploadToCloudController } from './upload-to-cloud.controller.js';
import { CloudinaryModule } from '../cloudinary/cloudinary.module.js';

@Module({
  imports: [CloudinaryModule],
  controllers: [UploadToCloudController],
  providers: [UploadToCloudService],
  exports: [UploadToCloudService],
})
export class UploadToCloudModule {}
