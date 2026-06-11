import { forwardRef, Module } from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { InvoiceController } from './invoice.controller';
import { UploadToCloudModule } from '../../utils/upload-to-cloud/upload-to-cloud.module';
import { CompanyModule } from '../company/company.module';
import { InvoiceTemplateRegistry } from './template.registry';

import { DrizzleModule } from '../../drizzle/drizzle.module';
import { InvoicePayloadBuilderService } from './invoice-payload-builder.service';

@Module({
  imports: [
    UploadToCloudModule,
    forwardRef(() => CompanyModule),
    DrizzleModule,
  ],
  controllers: [InvoiceController],
  providers: [
    InvoiceService,
    InvoiceTemplateRegistry,

    InvoicePayloadBuilderService,

  ],
  exports: [InvoiceService],
})
export class InvoiceModule {}
