import { forwardRef, Module } from '@nestjs/common';
import { OffersService } from './offers.service';
import { OffersController } from './offers.controller';
import { CompanyModule } from '../company/company.module';
import { DrizzleModule } from 'src/drizzle/drizzle.module';

@Module({
  imports: [forwardRef(() => CompanyModule), DrizzleModule],
  controllers: [OffersController],
  providers: [OffersService],
  exports: [OffersService],
})
export class OffersModule {}
