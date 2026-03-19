import { PartialType } from '@nestjs/swagger';
import { CreateProductReviewDto } from './create-product-review.dto';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class UpdateProductReviewDto extends PartialType(
  CreateProductReviewDto,
) {
  @IsNotEmpty()
  @IsString()
  rating?: number;

  @IsString()
  @Length(0, 300)
  review?: string;
}
