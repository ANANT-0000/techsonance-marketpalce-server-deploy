import { Controller } from '@nestjs/common';
import { UploadToCloudService } from './upload-to-cloud.service';

@Controller('upload-to-cloud')
export class UploadToCloudController {
  constructor(private readonly uploadToCloudService: UploadToCloudService) {}
}
