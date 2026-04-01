import {
  IsString,
  IsNumber,
  IsBoolean,
  IsArray,
  IsOptional,
  ValidateNested,
  IsEnum,
  IsNumberString,
  IsObject,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
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
  has_variants!: boolean;

  @IsNumberString()
  base_price!: string;

  @IsNumberString()
  discount_percent!: string;

  @IsNumber()
  @Type(() => Number)
  stock_quantity!: number;

  @Transform(({ value }) =>
    typeof value !== 'string' ? value.toString() : value,
  )
  @IsString()
  variant_name!: string;

  @IsString()
  sku!: string;
 
  @IsOptional()
  @IsString()
  price!: string;

  @IsOptional()
  @IsArray()
  attributes!: Record<string, any>[];

  @IsOptional()
  @IsString()
  seo_meta!: string;
} 