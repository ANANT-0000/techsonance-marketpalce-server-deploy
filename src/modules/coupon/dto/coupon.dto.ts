import { PartialType } from '@nestjs/mapped-types';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  IsBoolean,
  IsDateString,
  IsArray,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum DiscountType {
  PERCENTAGE = 'percentage',
  FIXED_CART = 'fixed_cart',
  FIXED_PRODUCT = 'fixed_product',
  FREE_SHIPPING = 'free_shipping',
}

export class CreateCouponDTO {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(DiscountType)
  discount_type!: DiscountType;

  @IsString()
  @IsNotEmpty()
  discount_value!: string;

  @IsOptional()
  @IsString()
  min_order_amount?: string;

  @IsOptional()
  @IsString()
  max_discount_amount?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  max_uses?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  max_uses_per_user?: number;

  @IsOptional()
  @IsBoolean()
  is_auto_applied?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsDateString()
  valid_from!: Date;

  @IsDateString()
  valid_to!: Date;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicable_product_ids?: string[];
}

export class UpdateCouponDTO extends PartialType(CreateCouponDTO) {}
