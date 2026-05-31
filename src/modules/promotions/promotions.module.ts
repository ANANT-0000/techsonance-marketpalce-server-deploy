import { forwardRef, Module } from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { PromotionsController } from './promotions.controller';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { CompanyModule } from '../company/company.module';

@Module({
  imports: [DrizzleModule, forwardRef(() => CompanyModule)],
  controllers: [PromotionsController],
  providers: [PromotionsService],
  exports: [PromotionsService],
})
export class PromotionsModule {}
