import { Module } from '@nestjs/common';
import { UploadToCloudService } from './upload-to-cloud.service';
import { UploadToCloudController } from './upload-to-cloud.controller';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';

@Module({
  imports: [CloudinaryModule],
  controllers: [UploadToCloudController],
  providers: [UploadToCloudService],
  exports: [UploadToCloudService],
})
export class UploadToCloudModule {}
