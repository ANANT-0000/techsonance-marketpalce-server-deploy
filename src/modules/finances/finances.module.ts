import { Module } from '@nestjs/common';
import { FinancesService } from './finances.service';
import { FinancesController } from './finances.controller';
import { DrizzleModule } from 'src/drizzle/drizzle.module';
import { CompanyModule } from '../company/company.module';

@Module({
  imports:[DrizzleModule,CompanyModule],
  controllers: [FinancesController],
  providers: [FinancesService],
})
export class FinancesModule {}
