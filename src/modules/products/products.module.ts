import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';
import { UploadToCloudModule } from '../../utils/upload-to-cloud/upload-to-cloud.module.js';
import { CompanyModule } from '../company/company.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';

@Module({
  imports: [DrizzleModule, UploadToCloudModule, CompanyModule, InventoryModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
