import {
  IsString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PriceInterval, FeatureType } from '../../../drizzle/types/types.js';

export class PlanPriceDto {
  @IsString()
  currency!: string;

  @IsEnum(PriceInterval)
  interval!: PriceInterval;

  @IsOptional()
  @IsNumber()
  intervalCount?: number;

  @IsNumber()
  @Min(0)
  amountCents!: number;
}

export class PlanFeatureDto {
  @IsString()
  key!: string;

  @IsEnum(FeatureType)
  type!: FeatureType;

  // Since value can be boolean, number, or string, we don't enforce a strict primitive here
  // But we can check that it's defined. In a real app, custom validators can check value against type.
  value!: boolean | number | string;
}

export class PlanPayloadDto {
  @IsString()
  planKey!: string;

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
