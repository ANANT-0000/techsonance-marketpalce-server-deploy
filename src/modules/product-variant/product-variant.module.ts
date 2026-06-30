import { Module } from '@nestjs/common';
import { ProductVariantService } from './product-variant.service.js';
import { ProductVariantController } from './product-variant.controller.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';
import { UploadToCloudModule } from '../../utils/upload-to-cloud/upload-to-cloud.module.js';
import { CompanyModule } from '../company/company.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';

@Module({
  imports: [DrizzleModule, UploadToCloudModule, CompanyModule, InventoryModule],
  controllers: [ProductVariantController],
  providers: [ProductVariantService],
})
export class ProductVariantModule {}
