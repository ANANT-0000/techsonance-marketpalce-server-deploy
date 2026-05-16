import { Module } from '@nestjs/common';
import { ProductPoliciesService } from './product-policies.service';
import { ProductPoliciesController } from './product-policies.controller';
import { DrizzleModule } from '../../drizzle/drizzle.module';

import { CompanyModule } from '../company/company.module';

@Module({
  imports: [DrizzleModule, CompanyModule],
  controllers: [ProductPoliciesController],
  providers: [ProductPoliciesService],
  exports: [ProductPoliciesService],
})
export class ProductPoliciesModule {}
