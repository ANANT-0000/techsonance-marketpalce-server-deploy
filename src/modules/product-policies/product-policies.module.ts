import { forwardRef, Module, OnModuleInit } from '@nestjs/common';
import { ProductPoliciesService } from './product-policies.service';
import { ProductPoliciesController } from './product-policies.controller';
import { DrizzleModule } from '../../drizzle/drizzle.module';

import { CompanyModule } from '../company/company.module';
import { PuppeteerWarrantyTemplate } from './templates/puppeteer-warranty.template';
import { PolicyTemplateRegistry } from './policy-template.registry';
import { PolicyDocumentService } from './policy-document.service';
import { PolicyPayloadBuilderService } from './policy-payload-builder.service';
import { UploadToCloudModule } from '../../utils/upload-to-cloud/upload-to-cloud.module';
import { PolicyResolutionService } from './policy-resolution.service';
@Module({
  imports: [
    DrizzleModule,
    forwardRef(() => CompanyModule),
    UploadToCloudModule,
  ],
  controllers: [ProductPoliciesController],
  providers: [
    ProductPoliciesService,
    PolicyDocumentService,
    PolicyPayloadBuilderService,
    PolicyTemplateRegistry,
    PuppeteerWarrantyTemplate,
    PolicyResolutionService,
  ],
  exports: [
    ProductPoliciesService,
    PolicyDocumentService,
    PolicyTemplateRegistry,
    PolicyResolutionService,
  ],
})
export class ProductPoliciesModule implements OnModuleInit {
  constructor(
    private readonly templateRegistry: PolicyTemplateRegistry,
    private readonly warrantyTemplate: PuppeteerWarrantyTemplate,
  ) {}

  onModuleInit() {
    this.templateRegistry.register(this.warrantyTemplate);
  }
}
