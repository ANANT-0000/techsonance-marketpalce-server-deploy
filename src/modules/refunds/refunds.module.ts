import { Module } from '@nestjs/common';
import { RefundsService } from './refunds.service.js';
import { RefundsController } from './refunds.controller.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';
import { CompanyModule } from '../company/company.module.js';
import { MailModule } from '../../common/services/mail/mail.module.js';

@Module({
  imports: [DrizzleModule, CompanyModule, MailModule],
  controllers: [RefundsController],
  providers: [RefundsService],
  exports: [RefundsService],
})
export class RefundsModule {}
