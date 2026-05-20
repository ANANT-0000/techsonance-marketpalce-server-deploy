import {
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsBoolean,
  Min,
  IsString,
} from 'class-validator';

export class AssignCategoryPolicyDto {
  @IsNotEmpty({ message: 'Category ID is required' })
  @IsString({ message: 'Category ID must be a valid UUID' })
  category_id!: string;

  @IsNotEmpty({ message: 'Policy ID is required' })
  @IsString({ message: 'Policy ID must be a valid UUID' })
  policy_id!: string;

  @IsOptional()
  @IsInt({ message: 'Priority must be an integer' })
  @Min(1, { message: 'Priority must be at least 1' })
  priority?: number;
}

export class AssignProductPolicyOverrideDto {
  @IsNotEmpty({ message: 'Product ID is required' })
  @IsString({ message: 'Product ID must be a valid UUID' })
  product_id!: string;

  @IsNotEmpty({ message: 'Policy ID is required' })
  @IsString({ message: 'Policy ID must be a valid UUID' })
  policy_id!: string;

  @IsOptional()
  @IsBoolean({ message: 'Overrides category must be a boolean value' })
  overrides_category?: boolean;
}

export class CreateOrderItemPolicySnapshotDto {
  @IsNotEmpty({ message: 'Order Item ID is required' })
  @IsString({ message: 'Order Item ID must be a valid UUID' })
  order_item_id!: string;

  @IsNotEmpty({ message: 'Policy ID is required' })
  @IsString({ message: 'Policy ID must be a valid UUID' })
  policy_id!: string;

  @IsNotEmpty({ message: 'Policy start date is required' })
  @IsString({
    message: 'Policy start date must be a valid ISO date string',
  })
  policy_start_date!: string;
  @IsOptional()
  @IsString({ message: 'Document URL must be a valid URL format' })
  order_item_policy_document_url?: string;
}
