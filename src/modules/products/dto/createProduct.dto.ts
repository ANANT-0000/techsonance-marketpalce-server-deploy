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
import { ProductStatus } from '../../../drizzle/types/types';

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

  @IsString()
  category_id!: string;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsNumberString()
  base_price!: string;

  @IsNumberString()
  discount_percent!: string;

  @IsNumber()
  @Type(() => Number)
  stock_quantity!: number;

  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
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
