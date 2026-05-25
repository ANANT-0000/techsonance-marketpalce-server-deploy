import {
  IsString,
  IsBoolean,
  IsOptional,
  IsArray,
  IsEnum,
  IsNumber,
  IsDateString,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PromotionRuleType, PromotionType } from '../../../drizzle/types/types';

// ─── RULE CONFIG DTOs ────────────────────────────────────────────
// One class per PromotionRuleType — mirrors the jsonb shapes in
// promotions.schema.ts and the frontend PromotionRuleDto union.

export class RuleConfig_MinCartValue {
  @IsNumber() amount!: number;
}

export class RuleConfig_MinQty {
  @IsNumber() qty!: number;
}

export class RuleConfig_CustomerSegment {
  @IsString() segment_id!: string;
}

export class RuleConfig_FirstOrderOnly {
  // Intentionally empty — presence of the rule is the condition
}

export class RuleConfig_ProductInCart {
  @IsString() product_id!: string;
}

export class RuleConfig_NewCustomer {
  @IsNumber() registered_within_days!: number;
}

export class RuleConfig_DateRange {
  @IsArray()
  @IsNumber({}, { each: true })
  days_of_week!: number[]; // 0 = Sun, 6 = Sat
}

export class RuleConfig_MaxUsesPerUser {
  @IsNumber() max!: number;
}

// ─── RULE ROW DTO ────────────────────────────────────────────────
// Each element in CreateCouponDto.rules[].
// The service reads rule_type first to know which config fields to
// pull into the typed jsonb — no more `'min_cart_value' as any`.

export class PromotionRuleDto {
  @IsEnum(PromotionRuleType)
  rule_type!: PromotionRuleType;

  /**
   * Flat config object — validated loosely here because the exact
   * shape depends on rule_type. The service maps it to the correct
   * typed config before inserting.
   *
   * Alternatively, split into separate endpoint bodies per rule type
   * or use a class-transformer discriminator if strict validation
   * is needed at the DTO layer.
   */
  @IsObject()
  rule_config!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  negate?: boolean = false;
}

// ─── CREATE COUPON DTO ───────────────────────────────────────────

export class CreateCouponDto {
  @IsString()
  code!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(PromotionType)
  discount_type!: PromotionType;

  @IsString()
  discount_value!: string; // Service parses to Number

  @IsOptional()
  @IsString()
  max_discount_amount?: string;

  @IsDateString()
  valid_from!: string;

  @IsDateString()
  valid_to!: string;

  @IsOptional()
  @IsNumber()
  max_uses?: number;

  @IsOptional()
  @IsNumber()
  max_uses_per_user?: number;

  @IsOptional()
  @IsBoolean()
  is_auto_applied?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicable_product_ids?: string[];

  /**
   * Promotion rules — replaces the old hardcoded `min_order_amount` field.
   * Each row carries a rule_type + rule_config that the service inserts
   * directly into promotion_rules using the typed config shape.
   *
   * Examples:
   *   { rule_type: 'min_cart_value', rule_config: { amount: 500 } }
   *   { rule_type: 'first_order_only', rule_config: {} }
   *   { rule_type: 'new_customer', rule_config: { registered_within_days: 30 } }
   *   { rule_type: 'date_range', rule_config: { days_of_week: [0, 6] } }
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PromotionRuleDto)
  rules?: PromotionRuleDto[];
}
        
// ─── UPDATE COUPON DTO ───────────────────────────────────────────

export class UpdateCouponDto {
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsDateString()
  valid_from?: string;

  @IsOptional()
  @IsDateString()
  valid_to?: string;

  @IsOptional()
  @IsNumber()
  max_uses?: number;

  @IsOptional()
  @IsString()
  discount_value?: string;

  @IsOptional()
  @IsString()
  max_discount_amount?: string;

  /**
   * When provided, REPLACES all existing rules for this coupon's
   * linked promotion. Pass an empty array to clear all rules.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PromotionRuleDto)
  rules?: PromotionRuleDto[];
}
