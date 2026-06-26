import { forwardRef, Module, OnModuleInit } from '@nestjs/common';
import { ProductPoliciesService } from './product-policies.service';
import { ProductPoliciesController } from './product-policies.controller';
import { DrizzleModule } from '../../drizzle/drizzle.module';

import { CompanyModule } from '../company/company.module';

import { PolicyPayloadBuilderService } from './policy-payload-builder.service';
import { UploadToCloudModule } from '../../utils/upload-to-cloud/upload-to-cloud.module';

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
