import { Module } from '@nestjs/common';
import { ProductVariantService } from './product-variant.service';
import { ProductVariantController } from './product-variant.controller';
import { DrizzleModule } from 'src/drizzle/drizzle.module';
import { UploadToCloudModule } from 'src/utils/upload-to-cloud/upload-to-cloud.module';

@Module({
  imports: [DrizzleModule, UploadToCloudModule],
  controllers: [ProductVariantController],
  providers: [ProductVariantService],
})
export class ProductVariantModule {}
