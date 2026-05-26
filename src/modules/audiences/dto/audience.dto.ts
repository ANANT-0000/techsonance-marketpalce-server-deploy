import { Type } from 'class-transformer';
import {
  IsString,
  IsNumber,
  IsArray,
  IsOptional,
  IsEnum,
  ValidateNested,
  MinLength,
  MaxLength,
  Min,
} from 'class-validator';
import { SegmentCriteriaOperator } from '../../../drizzle/types/types';

export enum SegmentField {
  TOTAL_ORDERS = 'total_orders',
  TOTAL_SPENT = 'total_spent',
  REGISTERED_DAYS_AGO = 'registered_days_ago',
  LAST_ORDER_DAYS_AGO = 'last_order_days_ago',
  AVERAGE_ORDER_VALUE = 'average_order_value',
}

export enum SegmentOperator {
  GTE = 'gte',
  LTE = 'lte',
  EQ = 'eq',
}

export class SegmentCriterion {
  @IsEnum(SegmentField, {
    message:
      'field must be one of: total_orders, total_spent, registered_days_ago, last_order_days_ago, average_order_value',
  })
  field!: SegmentField;

  @IsEnum(SegmentOperator, {
    message: 'operator must be one of: gte, lte, eq',
  })
  operator!: SegmentOperator;

  @IsNumber({}, { message: 'value must be a number' })
  @Min(0, { message: 'value must be greater than or equal to 0' })
  value!: number;
}

export class CreateSegmentDto {
  @IsString({ message: 'name must be a string' })
  @MinLength(3, { message: 'name must be at least 3 characters' })
  @MaxLength(100, { message: 'name must not exceed 100 characters' })
  name!: string;

  @IsOptional()
  @IsString({ message: 'description must be a string' })
  @MaxLength(500, { message: 'description must not exceed 500 characters' })
  description?: string;

  @IsArray({ message: 'criteria must be an array' })
  @ValidateNested({ each: true })
  @Type(() => SegmentCriterion)
  criteria!: SegmentCriterion[];

  @IsOptional()
  @IsEnum(SegmentCriteriaOperator, {
    message: 'criteria_operator must be either AND or OR',
  })
  criteria_operator?: SegmentCriteriaOperator;
}
