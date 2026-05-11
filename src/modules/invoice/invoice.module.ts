import { forwardRef, Module } from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { InvoiceController } from './invoice.controller';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { PdfModule } from '../../utils/pdf/pdf.module';
import { UploadToCloudModule } from '../../utils/upload-to-cloud/upload-to-cloud.module';
import { CompanyModule } from '../company/company.module';

@Module({
  imports: [DrizzleModule, UploadToCloudModule, PdfModule, CompanyModule],
  controllers: [InvoiceController],
  providers: [InvoiceService],
  exports: [InvoiceService],
})
export class InvoiceModule {}
