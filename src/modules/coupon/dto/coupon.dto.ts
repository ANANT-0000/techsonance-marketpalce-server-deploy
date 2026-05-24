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

import { PromotionRuleType, PromotionType } from '../../../drizzle/types/types';

export class CreateCouponDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(PromotionType)
  discount_type!: PromotionType;

  @Type(() => String)
  @IsString()
  @IsNotEmpty()
  discount_value!: string;

  @IsOptional()
  @Type(() => String)
  @IsString()
  rule_type?: PromotionRuleType;

  @IsOptional()
  @Type(() => String)
  @IsString()
  rule_value?: string;

  @IsOptional()
  @Type(() => String)
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

export class UpdateCouponDto extends PartialType(CreateCouponDto) {
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
