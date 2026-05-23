import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  IsEnum,
  IsNumber,
  IsInt,
  Min,
  IsOptional,
  IsArray,
  IsUrl,
  IsBoolean,
  IsDateString,
  IsObject,
  ArrayNotEmpty,
} from 'class-validator';

export enum DiscountType {
  PERCENTAGE = 'percentage',
  FIXED = 'fixed',
}

export class createOfferDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(DiscountType)
  @IsNotEmpty()
  discount_type!: DiscountType;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount_value!: number;

  @IsDateString()
  @IsOptional()
  valid_from?: string;

  @IsDateString()
  @IsOptional()
  valid_to?: string;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @IsArray()
  @ArrayNotEmpty()
  @IsUrl({}, { each: true })
  poster_url!: string[];

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  display_priority?: number;

  @IsOptional()
  @IsObject()
  theme_config?: object;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  placement?: string[];
}
