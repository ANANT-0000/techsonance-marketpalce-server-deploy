// src/product/dto/create-product.dto.ts
import {
  IsString,
  IsNumber,
  IsBoolean,
  IsArray,
  IsOptional,
  ValidateNested,
  IsObject,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProductStatus } from 'src/drizzle/types/types';

class FeatureDto {
  @IsString()
  title!: string;

  @IsString()
  description!: string;
}
export class VariantDto {
  @IsString()
  variant_name!: string;

  @IsObject()
  attributes!: Record<string, any>;

  @IsString()
  sku!: string;

  @IsString()
  price!: string;

  @IsNumber()
  stock_quantity!: number;

  @IsOptional()
  @IsString()
  seo_meta?: string;
}
export class CategoryDto {
  @IsString()
  id!: string;

  @IsString()
  name!: string;
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

  @IsString()
  base_price!: string;

  @IsString()
  discount_percent?: string;

  @IsNumber()
  stock_quantity!: number;

  @IsString()
  sku?: string;

  @IsString()
  category!: CategoryDto;

  @IsEnum(ProductStatus)
  status!: ProductStatus;

  @IsBoolean()
  has_variants!: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeatureDto)
  features!: FeatureDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantDto)
  @IsOptional()
  variants?: VariantDto[];
}
