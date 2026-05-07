import { forwardRef, Module } from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { InvoiceController } from './invoice.controller';
import { DrizzleModule } from 'src/drizzle/drizzle.module';
import { PdfModule } from 'src/utils/pdf/pdf.module';
import { UploadToCloudModule } from 'src/utils/upload-to-cloud/upload-to-cloud.module';

@Module({
  imports: [DrizzleModule, UploadToCloudModule, PdfModule],
  controllers: [InvoiceController],
  providers: [InvoiceService],
  exports: [InvoiceService],
})
export class InvoiceModule {}
