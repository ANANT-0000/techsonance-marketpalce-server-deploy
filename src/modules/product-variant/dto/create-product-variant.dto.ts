import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  isString,
  IsString,
} from 'class-validator';
import { ProductStatus } from 'src/drizzle/types/types';

export class CreateProductVariantDto {
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  variant_name!: string;

  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  sku!: string;
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  price!: string;
  @IsObject()
  attributes!: Record<string, any>;
  @IsEnum(ProductStatus)
  status!: ProductStatus;
  @IsNumber()
  stock_quantity!: number;

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
}
