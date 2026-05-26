import { Module } from '@nestjs/common';
import { AudiencesService } from './audiences.service';
import { AudiencesController } from './audiences.controller';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { CompanyModule } from '../company/company.module';

@Module({
  imports: [DrizzleModule, CompanyModule],
  controllers: [AudiencesController],
  providers: [AudiencesService],
})
export class AudiencesModule {}
