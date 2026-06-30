import { Module } from '@nestjs/common';
import { TemplateService } from './template.service.js';
import { TemplateController } from './template.controller.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';
import { UploadToCloudModule } from '../../utils/upload-to-cloud/upload-to-cloud.module.js';

@Module({
  imports: [DrizzleModule, UploadToCloudModule],
  controllers: [TemplateController],
  providers: [TemplateService],
})
export class TemplateModule {}
