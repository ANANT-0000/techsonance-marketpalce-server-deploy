import { forwardRef, Module } from '@nestjs/common';
import { InvoiceService } from './invoice.service.js';
import { InvoiceController } from './invoice.controller.js';
import { UploadToCloudModule } from '../../utils/upload-to-cloud/upload-to-cloud.module.js';
import { CompanyModule } from '../company/company.module.js';

import { DrizzleModule } from '../../drizzle/drizzle.module.js';
import { InvoicePayloadBuilderService } from './invoice-payload-builder.service.js';

@Module({
  imports: [
    UploadToCloudModule,
    forwardRef(() => CompanyModule),
    DrizzleModule,
  ],
  controllers: [InvoiceController],
  providers: [InvoiceService, InvoicePayloadBuilderService],
  exports: [InvoiceService],
})
export class InvoiceModule {}
