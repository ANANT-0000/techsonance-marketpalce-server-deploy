import {
  IsString,
  IsNumber,
  IsBoolean,
  IsArray,
  IsOptional,
  ValidateNested,
  IsEnum,
  IsNumberString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProductStatus } from 'src/drizzle/types/types';

class FeatureDto {
  @IsString()
  title!: string;

  @IsString()
  description!: string;
}
export class ProductImgDto {
  @IsString()
  url!: string;
  @IsEnum(['main', 'gallery', 'thumbnail'])
  type!: 'main' | 'gallery' | 'thumbnail';
}

export class CreateProductDto {
  @IsString()
  name!: string;

  @IsString()
  description!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeatureDto)
  features!: FeatureDto[];

  @IsString()
  category_id!: string;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsString()
  tax_profile?: string;

  @IsOptional()
  @IsBoolean()
  has_variants?: boolean;

  @IsNumberString()
  base_price!: string;

  @IsNumberString()
  discount_percent!: string;

  @IsNumber()
  @Type(() => Number)
  stock_quantity?: number;

  @IsOptional()
  @IsString()
  sku?: string;
}
