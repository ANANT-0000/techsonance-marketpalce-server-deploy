import { Module } from '@nestjs/common';
import { ReturnsService } from './returns.service';
import { ReturnsController } from './returns.controller';
import { CompanyModule } from '../company/company.module';
import { DrizzleModule } from 'src/drizzle/drizzle.module';
import { UploadToCloudModule } from 'src/utils/upload-to-cloud/upload-to-cloud.module';
import { RefundsModule } from '../refunds/refunds.module';
import { InventoryModule } from '../inventory/inventory.module';
import { MailModule } from 'src/common/services/mail/mail.module';

@Module({
  imports: [CompanyModule, DrizzleModule, UploadToCloudModule, RefundsModule, InventoryModule, MailModule],
  controllers: [ReturnsController],
  providers: [ReturnsService],
})
export class ReturnsModule { }
