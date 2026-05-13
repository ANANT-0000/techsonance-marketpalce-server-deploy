import {  Module } from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { InvoiceController } from './invoice.controller';
import { DrizzleModule } from '../../drizzle/drizzle.module';
// import { PdfModule } from '../../utils/pdf/pdf.module';
import { UploadToCloudModule } from '../../utils/upload-to-cloud/upload-to-cloud.module';
import { CompanyModule } from '../company/company.module';
import { InvoiceTemplateRegistry } from './template.registry';
import { StandardGstInvoiceTemplate } from './templates/standard-gst.template';

@Module({
  imports: [DrizzleModule, UploadToCloudModule, CompanyModule],
  controllers: [InvoiceController],
  providers: [
    InvoiceService,
    InvoiceTemplateRegistry,
    StandardGstInvoiceTemplate,
  ],
  exports: [InvoiceService],
})
export class InvoiceModule {}
