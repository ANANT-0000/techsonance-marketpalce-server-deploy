import { Module } from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { InvoiceController } from './invoice.controller';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { UploadToCloudModule } from '../../utils/upload-to-cloud/upload-to-cloud.module';
import { CompanyModule } from '../company/company.module';
import { InvoiceTemplateRegistry } from './template.registry';
import { StandardGstInvoiceTemplate } from './templates/standard-gst.template';
import { InvoicePayloadBuilderService } from './invoice-payload-builder.service';
import { MinimalInvoiceTemplate } from './templates/minimal.template';

@Module({
  imports: [DrizzleModule, UploadToCloudModule, CompanyModule],
  controllers: [InvoiceController],
  providers: [
    InvoiceService,
    InvoiceTemplateRegistry,
    InvoicePayloadBuilderService,
    StandardGstInvoiceTemplate,
    MinimalInvoiceTemplate,
    // BrandedInvoiceTemplate,   // ← just uncomment to activate
    // ExportInvoiceTemplate,    // ← just uncomment to activate
  ],
  exports: [InvoiceService],
})
export class InvoiceModule {}
