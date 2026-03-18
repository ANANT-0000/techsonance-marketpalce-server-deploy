import { Controller } from '@nestjs/common';
import { UploadMediaService } from './upload-media.service';

@Controller('upload-media')
export class UploadMediaController {
  constructor(private readonly uploadMediaService: UploadMediaService) {}
}
