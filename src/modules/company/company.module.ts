import { forwardRef, Module } from '@nestjs/common';
import { CompanyService } from './company.service';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { CompanyController } from './company.controller';
import { UsersModule } from '../users/users.module';
import { VendorsModule } from '../vendors/vendors.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [
    DrizzleModule,
    forwardRef(() => UsersModule),
    forwardRef(() => VendorsModule),
    forwardRef(() => OrdersModule),
  ],
  providers: [CompanyService],
  exports: [CompanyService],
  controllers: [CompanyController],
})
export class CompanyModule {}
