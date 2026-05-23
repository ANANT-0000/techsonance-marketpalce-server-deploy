import { forwardRef, Module } from '@nestjs/common';
import { CompanyService } from './company.service';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { CompanyController } from './company.controller';
import { UsersModule } from '../users/users.module';
import { VendorsModule } from '../vendors/vendors.module';
import { OffersModule } from '../offers/offers.module';

@Module({
  imports: [
    DrizzleModule,
    forwardRef(() => UsersModule),
    forwardRef(() => VendorsModule),
    forwardRef(() => OffersModule),
  ],
  providers: [CompanyService],
  exports: [CompanyService],
  controllers: [CompanyController],
})
export class CompanyModule {}
