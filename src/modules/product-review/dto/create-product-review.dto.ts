// src/modules/product-review/dto/create-product-review.dto.ts
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  Length,
} from 'class-validator';

export class CreateProductReviewDto {
  @IsNotEmpty()
  @IsString()
  product_variant_id!: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsString()
  @IsOptional()
  @Length(10, 500, { message: 'Review must be between 10 and 500 characters' })
  review?: string;
}
