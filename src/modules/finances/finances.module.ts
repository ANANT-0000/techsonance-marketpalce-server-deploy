import { forwardRef, Module } from '@nestjs/common';
import { FinancesService } from './finances.service.js';
import { FinancesController } from './finances.controller.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';
import { CompanyModule } from '../company/company.module.js';

@Module({
  imports: [DrizzleModule, forwardRef(() => CompanyModule)],
  controllers: [FinancesController],
  providers: [FinancesService],
  exports: [FinancesService],
})
export class FinancesModule {}
