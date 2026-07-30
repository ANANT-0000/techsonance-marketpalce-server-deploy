import { Module } from '@nestjs/common';
import { CartService } from './cart.service.js';
import { CartController } from './cart.controller.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';
import { CompanyModule } from '../company/company.module.js';

import { PricingModule } from '../pricing/pricing.module.js';

@Module({
  imports: [DrizzleModule, CompanyModule, PricingModule],
  controllers: [CartController],
  providers: [CartService],
})
export class CartModule {}
