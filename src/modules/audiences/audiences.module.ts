import { Module } from '@nestjs/common';
import { AudiencesService } from './audiences.service.js';
import { AudiencesController } from './audiences.controller.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';
import { CompanyModule } from '../company/company.module.js';

@Module({
  imports: [DrizzleModule, CompanyModule],
  controllers: [AudiencesController],
  providers: [AudiencesService],
})
export class AudiencesModule {}
