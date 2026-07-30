import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';
import { FilterEvaluatorService } from './filter-evaluator.service.js';
import { ProductFiltersController } from './product-filters.controller.js';
import { ProductFiltersService } from './product-filters.service.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';
import { UploadToCloudModule } from '../../utils/upload-to-cloud/upload-to-cloud.module.js';
import { CompanyModule } from '../company/company.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { PricingModule } from '../pricing/pricing.module.js';

@Module({
  imports: [
    DrizzleModule,
    UploadToCloudModule,
    CompanyModule,
    InventoryModule,
    EntitlementsModule,
    PricingModule,
  ],
  controllers: [ProductsController, ProductFiltersController],
  providers: [ProductsService, FilterEvaluatorService, ProductFiltersService],
  exports: [ProductsService, FilterEvaluatorService, ProductFiltersService],
})
export class ProductsModule {}
