import { forwardRef, Module } from '@nestjs/common';
import { VendorsService } from './vendors.service';
import { VendorsController } from './vendors.controller';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { JwtModule } from '@nestjs/jwt';
import { MailModule } from '../../common/services/mail/mail.module';
import { UploadToCloudModule } from '../../utils/upload-to-cloud/upload-to-cloud.module';
import { CompanyModule } from '../company/company.module';
import { OrdersModule } from '../orders/orders.module';
@Module({
  imports: [
    DrizzleModule,
    JwtModule,
    MailModule,
    UploadToCloudModule,
    forwardRef(() => OrdersModule),
    forwardRef(() => CompanyModule),
  ],
  controllers: [VendorsController],
  providers: [VendorsService],
  exports: [VendorsService],
})
export class VendorsModule {}
