import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service.js';
import { PaymentController } from './payment.controller.js';
import { VendorCryptoService } from './vendor-crypto.service.js';
import { PaymentSplitterService } from './payment-splitter.service.js';
import { DrizzleModule } from '../../../drizzle/drizzle.module.js';
import { CompanyModule } from '../../company/company.module.js';

@Module({
  imports: [DrizzleModule, CompanyModule],
  controllers: [PaymentController],
  providers: [PaymentService, VendorCryptoService, PaymentSplitterService],
  exports: [PaymentService, VendorCryptoService, PaymentSplitterService],
})
export class PaymentModule {}
