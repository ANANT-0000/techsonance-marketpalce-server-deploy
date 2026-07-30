'';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ProductStatus } from '../../../drizzle/types/types.js';
import { Type } from 'class-transformer';

export class UpdateProductVariantDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value?: string }) => typeof value === 'string' ? value.trim() : value)
  variant_id?: string;

  @IsString()
  @Transform(({ value }: { value?: string }) => typeof value === 'string' ? value.trim() : value)
  variant_name!: string;

  @IsString()
  @Transform(({ value }: { value?: string }) => typeof value === 'string' ? value.trim() : value)
  sku!: string;

  @IsNumber()
  @Type(() => Number)
  price!: number;

  @IsArray()
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
  @Transform(({ value }: { value?: string }) => typeof value === 'string' ? value.trim() : value)
  seo_meta!: string | null;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value?: string }) => typeof value === 'string' ? value.trim() : value)
  warehouse_id!: string | null;

  @IsString()
  product_id!: string;

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
