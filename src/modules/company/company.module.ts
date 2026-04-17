import { Module } from '@nestjs/common';
import { CompanyService } from './company.service';
// import { CompanyController } from './company.controller';
import { DrizzleModule } from 'src/drizzle/drizzle.module';

@Module({
  imports: [DrizzleModule],
  // controllers: [CompanyController],
  providers: [CompanyService],
  exports: [CompanyService],
})
export class CompanyModule {}
