import { Module } from '@nestjs/common';
import { ProductReviewService } from './product-review.service';
import { ProductReviewController } from './product-review.controller';
import { DrizzleModule } from 'src/drizzle/drizzle.module';

@Module({
  imports: [DrizzleModule],
  controllers: [ProductReviewController],
  providers: [ProductReviewService],
})
export class ProductReviewModule {}
