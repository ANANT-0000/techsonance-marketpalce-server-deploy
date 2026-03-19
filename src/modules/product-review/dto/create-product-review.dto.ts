import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class CreateProductReviewDto {
  @IsNotEmpty()
  @IsString()
  rating!: number;

  @IsString()
  @IsOptional()
  @Length(0, 300)
  review?: string;

  @IsNotEmpty()
  @IsString()
  product_variant_id!: string;

  @IsNotEmpty()
  @IsString()
  user_id!: string;

  @IsNotEmpty()
  company_id!: string;
}
