import { Module } from '@nestjs/common';
import { FeedbackService } from './feedback.service.js';
import { FeedbackController } from './feedback.controller.js';
import { CompanyModule } from '../company/company.module.js';
import { DrizzleModule } from '../../drizzle/drizzle.module.js';

@Module({
  imports: [CompanyModule, DrizzleModule],
  controllers: [FeedbackController],
  providers: [FeedbackService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
