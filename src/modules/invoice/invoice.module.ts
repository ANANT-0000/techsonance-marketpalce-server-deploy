import { Module } from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { InvoiceController } from './invoice.controller';
import { UploadToCloudModule } from '../../utils/upload-to-cloud/upload-to-cloud.module';
import { CompanyModule } from '../company/company.module';
import { InvoiceTemplateRegistry } from './template.registry';
import { PuppeteerGstTemplate } from './templates/puppeteer-gst.template';
import { DrizzleModule } from 'src/drizzle/drizzle.module';
import { InvoicePayloadBuilderService } from './invoice-payload-builder.service';
import { PuppeteerMinimalTemplate } from './templates/puppeteer-minimal.template';

@Module({
  imports: [UploadToCloudModule, CompanyModule, DrizzleModule],
  controllers: [InvoiceController],
  providers: [
    InvoiceService,
    InvoiceTemplateRegistry,
    PuppeteerGstTemplate,
    InvoicePayloadBuilderService,
    PuppeteerMinimalTemplate,
  ],
  exports: [InvoiceService],
})
export class InvoiceModule {}
