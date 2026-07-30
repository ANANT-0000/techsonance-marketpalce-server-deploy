import {
  IsString,
  IsNumber,
 
  IsArray,
  IsOptional,
  ValidateNested,
  IsEnum,
  IsNumberString,
 
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ProductStatus } from '../../../drizzle/types/types.js';

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
  warehouse_id!: string;

  @IsString()
  tax_slab_id!: string;

  @IsString()
  name!: string;

  @IsString()
  description!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeatureDto)
  features!: FeatureDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  category_ids?: string[];

  @IsOptional()
  @IsString()
  primary_category_id?: string;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsNumber()
  @Type(() => Number)
  base_price!: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  compare_at_price?: number;

  @IsOptional()
  @IsString()
  sale_starts_at?: string;

  @IsOptional()
  @IsString()
  sale_ends_at?: string;

  @IsNumber()
  @Type(() => Number)
  stock_quantity!: number;

  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  variant_name!: string;

  @IsString()
  sku!: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  price!: number;

  @IsOptional()
  @IsArray()
  attributes!: Record<string, any>[];

  @IsOptional()
  @IsString()
  seo_meta!: string;

  @IsString()
  weight_kg!: string;

  @IsNumber()
  @Type(() => Number)
  length_cm!: number;

  @IsNumber()
  @Type(() => Number)
  width_cm!: number;

  @IsNumber()
  @Type(() => Number)
  height_cm!: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  product_media?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  feature_media?: string[];
}
