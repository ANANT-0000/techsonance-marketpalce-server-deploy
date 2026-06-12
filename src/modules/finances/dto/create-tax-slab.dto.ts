// ../../tax-slabs/dto/create-tax-slab.dto.ts
import {
  IsString,
  IsNotEmpty,
  IsUUID,
  Length,
  Matches,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsOptional,
  IsBoolean,
  Validate,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export enum TaxScope {
  INTRA_STATE = 'Intra-state',
  INTER_STATE = 'Inter-state',
  BOTH = 'Both',
}

export class CreateTaxSlabDto {
  // ── 1. Relations ──
  @IsString()
  @IsNotEmpty({ message: 'Tax profile ID is required' })
  tax_profile_id!: string;

  // ── 2. String Fields ──
  @IsString()
  @Length(2, 50, { message: 'Tax name must be between 2 and 50 characters' })
  tax_name!: string;

  @IsString()
  @Matches(/^[A-Z0-9-_]+$/, {
    message:
      'Tax code can only contain uppercase letters, numbers, hyphens, and underscores',
  })
  tax_code!: string;

  @IsString()
  @Length(3, 100, { message: 'Slab name must be at least 3 characters' })
  slab_name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500, { message: 'Description cannot exceed 500 characters' })
  description?: string;

  // ── 3. Enums & Numbers ──
  @IsEnum(TaxScope, { message: 'Please select a valid tax scope' })
  tax_scope!: TaxScope;

  @Type(() => String) // Coerces the incoming string to a number
  @Min(0, { message: 'Tax rate cannot be negative' })
  @Max(100, { message: 'Tax rate cannot exceed 100%' })
  total_rate!: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true) // Handles form checkbox coercion
  @IsBoolean()
  is_exempt?: boolean = false; // Default value

  // ── 4. Dates & Cross-Validation ──
  @IsNotEmpty({ message: 'Effective From date is required' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Must be a valid date (YYYY-MM-DD)',
  })
  effective_from!: string;

  @IsNotEmpty({ message: 'Effective From date is required' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Must be a valid date (YYYY-MM-DD)',
  })
  effective_to?: string;
}
