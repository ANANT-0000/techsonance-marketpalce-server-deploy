''
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ProductStatus } from 'src/drizzle/types/types';

export class UpdateProductVariantDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  variant_id?: string;

  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  variant_name!: string;

  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  sku!: string;

  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  price!: string;

  @IsArray()
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
  product_id!: string;
}
