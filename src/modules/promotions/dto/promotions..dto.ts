import {
  PromotionRuleType,
  PromotionStatus,
  PromotionTargetType,
  PromotionType,
} from '../../../drizzle/types/types';
import {
  IsEnum,
  IsOptional,
  IsBoolean,
  IsObject,
  IsString,
  MinLength,
  MaxLength,
  IsNumber,
  Min,
  IsArray,
  ValidateNested,
  IsISO8601,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PromotionRuleDto {
  @IsEnum(PromotionRuleType, {
    message: 'rule_type must be a valid PromotionRuleType',
  })
  rule_type!: PromotionRuleType;

  @IsObject({ message: 'rule_config must be an object' })
  rule_config!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean({ message: 'negate must be a boolean' })
  negate?: boolean;
}

export class PromotionTargetDto {
  @IsEnum(PromotionTargetType, {
    message: 'target_type must be a valid PromotionTargetType',
  })
  target_type!: PromotionTargetType;

  @IsOptional()
  @IsUUID('4', { message: 'target_id must be a valid UUID' })
  target_id?: string;

  @IsOptional()
  @IsBoolean({ message: 'exclude must be a boolean' })
  exclude?: boolean;
}

export class CreatePromotionDto {
  @IsString({ message: 'name must be a string' })
  @MinLength(3, { message: 'name must be at least 3 characters' })
  @MaxLength(200, { message: 'name must not exceed 200 characters' })
  name: string;

  @IsOptional()
  @IsString({ message: 'description must be a string' })
  @MaxLength(1000, { message: 'description must not exceed 1000 characters' })
  description?: string;

  @IsOptional()
  @IsString({ message: 'internal_note must be a string' })
  @MaxLength(1000, { message: 'internal_note must not exceed 1000 characters' })
  internal_note?: string;

  @IsEnum(PromotionType, {
    message: 'promotion_type must be a valid PromotionType',
  })
  promotion_type!: PromotionType;

  @IsObject({ message: 'discount_config must be an object' })
  discount_config!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean({ message: 'is_auto_applied must be a boolean' })
  is_auto_applied?: boolean;

  // Stacking
  @IsOptional()
  @IsNumber({}, { message: 'priority must be a number' })
  @Min(0, { message: 'priority must be >= 0' })
  priority?: number;

  @IsOptional()
  @IsBoolean({ message: 'is_exclusive must be a boolean' })
  is_exclusive?: boolean;

  // Schedule
  @IsISO8601({}, { message: 'valid_from must be an ISO 8601 date string' })
  valid_from!: string;

  @IsOptional()
  @IsISO8601({}, { message: 'valid_to must be an ISO 8601 date string' })
  valid_to?: string;

  // Usage caps
  @IsOptional()
  @IsNumber({}, { message: 'max_uses_total must be a number' })
  @Min(0, { message: 'max_uses_total must be >= 0' })
  max_uses_total?: number;

  @IsOptional()
  @IsNumber({}, { message: 'max_uses_per_user must be a number' })
  @Min(0, { message: 'max_uses_per_user must be >= 0' })
  max_uses_per_user?: number;

  // Rules (ANDed) — array matches promotion_rules table
  @IsOptional()
  @IsArray({ message: 'rules must be an array' })
  @ValidateNested({ each: true })
  @Type(() => PromotionRuleDto)
  rules?: PromotionRuleDto[];

  // Targets (ORed, exclusions override)
  @IsOptional()
  @IsArray({ message: 'targets must be an array' })
  @ValidateNested({ each: true })
  @Type(() => PromotionTargetDto)
  targets?: PromotionTargetDto[];

  // Status on creation — default DRAFT, pass ACTIVE to publish immediately
  @IsOptional()
  @IsString({ message: 'status must be a string' })
  status?: PromotionStatus;
}
export interface DiscountConfig {
  // percentage_off
  value?: number;
  cap?: number;
  // fixed_amount
  // value (same field)
  // buy_x_get_y
  buy_qty?: number;
  get_qty?: number;
  get_discount_percent?: number;
  // free_shipping
  max_shipping_waived?: number;
  // tiered_discount
  tiers?: { min_cart: number; percent: number }[];
  // bundle_deal
  product_variant_ids?: string[];
  bundle_price?: number;
}