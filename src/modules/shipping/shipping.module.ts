import { Module } from '@nestjs/common';
import { ShippingService } from './shipping.service';
import { ShippingController } from './shipping.controller';
import { DrizzleModule } from 'src/drizzle/drizzle.module';
import { CompanyModule } from '../company/company.module';
import { MailModule } from 'src/common/services/mail/mail.module';

@Module({
  imports: [DrizzleModule, CompanyModule, MailModule],
  controllers: [ShippingController],
  providers: [ShippingService],
})
export class ShippingModule { }
