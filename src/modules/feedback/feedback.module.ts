import { Module } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { FeedbackController } from './feedback.controller';
import { CompanyModule } from '../company/company.module';
import { DrizzleModule } from '../../drizzle/drizzle.module';

@Module({
  imports: [CompanyModule, DrizzleModule],
  controllers: [FeedbackController],
  providers: [FeedbackService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
