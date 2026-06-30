import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { VendorCryptoService } from './vendor-crypto.service';
import { PaymentSplitterService } from './payment-splitter.service';
import { DrizzleModule } from '../../../drizzle/drizzle.module';
import { CompanyModule } from '../../company/company.module';

@Module({
  imports: [DrizzleModule, CompanyModule],
  controllers: [PaymentController],
  providers: [PaymentService, VendorCryptoService, PaymentSplitterService],
  exports: [PaymentService, VendorCryptoService, PaymentSplitterService],
})
export class PaymentModule {}
