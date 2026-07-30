import { forwardRef, Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { VendorsService } from './vendors.service.js';
import { VendorsController } from './vendors.controller.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';
import { JwtModule } from '@nestjs/jwt';
import { MailModule } from '../../common/services/mail/mail.module.js';
import { UploadToCloudModule } from '../../utils/upload-to-cloud/upload-to-cloud.module.js';
import { CompanyModule } from '../company/company.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { SubscriptionModule } from '../subscription/subscription.module.js';

@Module({
  imports: [
    DrizzleModule,
    JwtModule,
    MailModule,
    UploadToCloudModule,
    forwardRef(() => OrdersModule),
    forwardRef(() => CompanyModule),
    SubscriptionModule,
    EntitlementsModule,
  ],
  controllers: [VendorsController],
  providers: [VendorsService],
  exports: [VendorsService],
})
export class VendorsModule {}
