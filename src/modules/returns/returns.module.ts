import { Module } from '@nestjs/common';
import { ReturnsService } from './returns.service.js';
import { ReturnsController } from './returns.controller.js';
import { CompanyModule } from '../company/company.module.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';
import { UploadToCloudModule } from '../../utils/upload-to-cloud/upload-to-cloud.module.js';
import { RefundsModule } from '../refunds/refunds.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { MailModule } from '../../common/services/mail/mail.module.js';
import { OrderEligibilityGuardModule } from '../order-eligibility-guard/order-eligibility-guard.module.js';

@Module({
  imports: [
    CompanyModule,
    DrizzleModule,
    UploadToCloudModule,
    RefundsModule,
    InventoryModule,
    MailModule,
    OrderEligibilityGuardModule,
  ],
  controllers: [ReturnsController],
  providers: [ReturnsService],
})
export class ReturnsModule {}

