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
class Attributes {
  @IsString()
  @Transform(({ value }: { value?: string }) => typeof value === 'string' ? value.trim() : value)
  name!: string;

  @IsString()
  @Transform(({ value }: { value?: string }) => typeof value === 'string' ? value.trim() : value)
  value!: string;
}
export class UpdateProductDto {
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

  @IsOptional()
  @IsString()
  tax_slab_id?: string;

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
  @Transform(({ value }: { value?: string }) => typeof value === 'string' ? value.trim() : value)
  variant_name!: string;

  @IsString()
  @Transform(({ value }: { value?: string }) => typeof value === 'string' ? value.trim() : value)
  variant_id!: string;
  @IsString()
  @Transform(({ value }: { value?: string }) => typeof value === 'string' ? value.trim() : value)
  warehouse_id!: string;

  @IsString()
  sku!: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  price!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Attributes)
  attributes!: Attributes[];

  @IsOptional()
  @IsString()
  seo_meta!: string;

  @IsOptional()
  @IsArray()
  imagesToDelete!: string[];

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
