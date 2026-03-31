import { Type } from 'class-transformer';
import { IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateProductVariantDto {
  @IsOptional()
  @IsString()
  variant_name?: string;

  @IsOptional()
  @IsObject()
  attributes!: Record<string, any>;

  @IsOptional()
  @IsString()
  sku!: string;

  @IsNumber()
  @Type(() => Number)
  price!: number;

  @IsNumber()
  stock_quantity!: number;

  @IsOptional()
  @IsString()
  seo_meta?: string;
}
