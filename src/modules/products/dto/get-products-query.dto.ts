import {
  IsOptional,
  IsString,
  IsNumberString,
  IsEnum,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export enum SortBy {
  NEWEST = 'newest',
  PRICE_ASC = 'price_asc',
  PRICE_DESC = 'price_desc',
  NAME_ASC = 'name_asc',
  DISCOUNT = 'discount',
}

export class GetProductsQueryDto {
  // --- Pagination ---
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 12;

  // --- Search ---
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string }) => value?.trim())
  search?: string;
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string }) => value?.trim())
  status?: string;

  // --- Filters ---
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Type(() => Number)
  min_price?: number;

  @IsOptional()
  @Type(() => Number)
  max_price?: number;

  // --- Sorting ---
  @IsOptional()
  @IsEnum(SortBy)
  sort_by?: SortBy = SortBy.NEWEST;
}
