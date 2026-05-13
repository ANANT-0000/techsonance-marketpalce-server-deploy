import { Module } from '@nestjs/common';
import { ProductPoliciesService } from './product-policies.service';
import { ProductPoliciesController } from './product-policies.controller';

@Module({
  controllers: [ProductPoliciesController],
  providers: [ProductPoliciesService],
})
export class ProductPoliciesModule {}
