import { forwardRef, Module } from '@nestjs/common';
import { CompanyService } from './company.service.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';
import { CompanyController } from './company.controller.js';
import { UsersModule } from '../users/users.module.js';
import { VendorsModule } from '../vendors/vendors.module.js';
import { OrdersModule } from '../orders/orders.module.js';

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
