import { Controller } from '@nestjs/common';
import { UploadToCloudService } from './upload-to-cloud.service.js';

@Controller('upload-to-cloud')
export class UploadToCloudController {
  constructor(private readonly uploadToCloudService: UploadToCloudService) {}
}
