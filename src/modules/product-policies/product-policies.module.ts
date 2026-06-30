import { forwardRef, Module, OnModuleInit } from '@nestjs/common';
import { ProductPoliciesService } from './product-policies.service.js';
import { ProductPoliciesController } from './product-policies.controller.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';

import { CompanyModule } from '../company/company.module.js';

import { PolicyPayloadBuilderService } from './policy-payload-builder.service.js';
import { UploadToCloudModule } from '../../utils/upload-to-cloud/upload-to-cloud.module.js';

@Module({
  imports: [
    DrizzleModule,
    forwardRef(() => CompanyModule),
    UploadToCloudModule,
  ],
  controllers: [ProductPoliciesController],
  providers: [ProductPoliciesService, PolicyPayloadBuilderService],
  exports: [ProductPoliciesService],
})
export class ProductPoliciesModule {}
