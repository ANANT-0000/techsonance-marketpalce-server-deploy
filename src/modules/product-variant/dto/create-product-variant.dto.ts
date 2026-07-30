import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsArray,
} from 'class-validator';
import { ProductStatus } from '../../../drizzle/types/types.js';

export class CreateProductVariantDto {
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  variant_name!: string;

  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  sku!: string;
  @IsNumber()
  @Type(() => Number)
  price!: number;
  @IsObject()
  attributes!: Record<string, any>;
  @IsEnum(ProductStatus)
  status!: ProductStatus;
  @IsNumber()
  stock_quantity!: number;

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

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  seo_meta!: string | null;

  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  product_id!: string;

  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  warehouse_id!: string;

  @IsString()
  weight_kg!: string;

  @IsNumber()
  length_cm!: number;

  @IsNumber()
  width_cm!: number;

  @IsNumber()
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
