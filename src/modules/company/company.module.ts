import { forwardRef, Module } from '@nestjs/common';
import { CompanyService } from './company.service';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { CompanyController } from './company.controller';
import { UsersModule } from '../users/users.module';
import { VendorsModule } from '../vendors/vendors.module';

@Module({
  imports: [
    DrizzleModule,
    forwardRef(() => UsersModule),
    forwardRef(() => VendorsModule),
  ],
  providers: [CompanyService],
  exports: [CompanyService],
  controllers: [CompanyController],
})
export class CompanyModule {}
