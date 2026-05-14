import { Module } from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { InvoiceController } from './invoice.controller';
import { UploadToCloudModule } from '../../utils/upload-to-cloud/upload-to-cloud.module';
import { CompanyModule } from '../company/company.module';
import { InvoiceTemplateRegistry } from './template.registry';
import { PuppeteerGstTemplate } from './templates/puppeteer-gst.template';

@Module({
  imports: [UploadToCloudModule, CompanyModule],
  controllers: [InvoiceController],
  providers: [InvoiceService, InvoiceTemplateRegistry, PuppeteerGstTemplate],
  exports: [InvoiceService],
})
export class InvoiceModule {}
