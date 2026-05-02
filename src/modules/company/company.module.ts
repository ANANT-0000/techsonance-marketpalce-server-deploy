import { Module } from '@nestjs/common';
import { CompanyService } from './company.service';
// import { CompanyController } from './company.controller';
import { DrizzleModule } from 'src/drizzle/drizzle.module';
import { CompanyController } from './company.controller';

@Module({
  imports: [DrizzleModule],
  providers: [CompanyService],
  exports: [CompanyService],
  controllers: [CompanyController],
})
export class CompanyModule {}
