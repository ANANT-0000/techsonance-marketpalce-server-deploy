import {
  IsString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  Min,
  IsDefined,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PriceInterval, FeatureValueType } from '../../../drizzle/types/types.js';

export class PlanPriceDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  plan_id?: string;

  @IsString()
  currency!: string;

  @IsEnum(PriceInterval)
  interval!: PriceInterval;

  @IsOptional()
  @IsNumber()
  interval_count?: number | null;

  @IsNumber()
  @Min(0)
  amount_minor_units!: number;

  @IsNumber()
  @Min(0)
  currency_exponent!: number;

  @IsOptional()
  @IsString()
  gateway_price_id?: string | null;

  @IsOptional()
  @IsString()
  sync_status?: string;

  @IsOptional()
  @IsString()
  created_at?: string;

  @IsOptional()
  @IsString()
  updated_at?: string;
}

export class PlanFeatureDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  plan_id?: string;

  @IsString()
  feature_key!: string;

  @IsEnum(FeatureValueType)
  type!: FeatureValueType;

  // Since value can be boolean, number, or string, we don't enforce a strict primitive here
  // But we can check that it's defined. In a real app, custom validators can check value against type.
  @IsDefined()
  value!: boolean | number | string;

  @IsOptional()
  @IsString()
  created_at?: string;
}

export class PlanPayloadDto {
  @IsString()
  planKey!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(1)
  version!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanPriceDto)
  prices!: PlanPriceDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanFeatureDto)
  features!: PlanFeatureDto[];
}
