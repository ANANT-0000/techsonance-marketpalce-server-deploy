import { Module } from '@nestjs/common';
import { UploadMediaService } from './upload-media.service';
import { UploadMediaController } from './upload-media.controller';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';

@Module({
  imports: [CloudinaryModule],
  controllers: [UploadMediaController],
  providers: [UploadMediaService],
  exports: [UploadMediaService],
})
export class UploadMediaModule {}
