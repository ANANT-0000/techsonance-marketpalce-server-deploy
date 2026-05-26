import { Module } from '@nestjs/common';
import { BannersService } from './banners.service';
import { BannersController } from './banners.controller';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { CompanyModule } from '../company/company.module';
import { UploadToCloudModule } from '../../utils/upload-to-cloud/upload-to-cloud.module';

@Module({
  imports: [DrizzleModule, CompanyModule, UploadToCloudModule],
  controllers: [BannersController],
  providers: [BannersService],
})
export class BannersModule {}
