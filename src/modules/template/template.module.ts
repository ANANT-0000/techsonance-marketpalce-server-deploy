import { Module } from '@nestjs/common';
import { TemplateService } from './template.service';
import { TemplateController } from './template.controller';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { UploadToCloudModule } from '../../utils/upload-to-cloud/upload-to-cloud.module';

@Module({
  imports: [DrizzleModule, UploadToCloudModule],
  controllers: [TemplateController],
  providers: [TemplateService],
})
export class TemplateModule {}
