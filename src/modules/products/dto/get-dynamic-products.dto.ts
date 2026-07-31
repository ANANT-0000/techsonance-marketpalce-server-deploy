import {
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GetProductsQueryDto } from './get-products-query.dto.js';

export enum Timeframe {
  LAST_7_DAYS = 'last_7_days',
  LAST_14_DAYS = 'last_14_days',
  LAST_30_DAYS = 'last_30_days',
  LAST_90_DAYS = 'last_90_days',
}

export enum Highlights {
  TRENDING = 'trending',
  NEW_ARRIVALS = 'new_arrivals',
  BESTSELLER = 'bestseller',
  FEATURED = 'featured',
}

export enum PriceCollation {
  UNDER_500 = 'under_500',
  UNDER_1000 = 'under_1000',
  FROM_1000_TO_5000 = '1000_to_5000',
  PREMIUM = 'premium',
}

export class GetDynamicProductsDto extends GetProductsQueryDto {
  @IsOptional()
  @IsEnum(Timeframe)
  timeframe?: Timeframe;

  @IsOptional()
  @IsEnum(Highlights)
  highlight?: Highlights;

  @IsOptional()
  @IsEnum(PriceCollation)
  price?: PriceCollation;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  discount?: number;
}
