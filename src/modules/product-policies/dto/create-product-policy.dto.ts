import {
  IsString,
  IsEnum,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
} from 'class-validator';

export enum PolicyType {
  WARRANTY = 'warranty',
  GUARANTEE = 'guarantee',
  EXCHANGE_ONLY = 'exchange_only',
  NO_RETURN = 'no_return',
  EXTENDED_SUPPORT = 'extended_support',
  NONE = 'none',
}

export enum DurationUnit {
  DAYS = 'days',
  MONTHS = 'months',
  YEARS = 'years',
  LIFETIME = 'lifetime',
}

export class CreateProductPolicyDto {
  @IsNotEmpty()
  @IsString()
  policy_name!: string;

  @IsEnum(PolicyType)
  policy_type!: PolicyType;

  // FIX #6: duration fields are optional — add @IsOptional()
  @IsOptional()
  @IsNumber()
  duration_value?: number;

  @IsOptional()
  @IsEnum(DurationUnit)
  duration_unit?: DurationUnit;

  @IsOptional()
  @IsString()
  coverage_description?: string;

  @IsOptional()
  @IsString()
  exclusions?: string;

  @IsOptional()
  @IsString()
  service_provider?: string;

  @IsOptional()
  @IsEmail()
  claim_contact_email?: string;

  @IsOptional()
  @IsString()
  claim_contact_phone?: string;

  @IsOptional()
  @IsString()
  claim_process_description?: string;

  @IsOptional()
  @IsBoolean()
  generates_document?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsString()
  document_id?: string;

  @IsOptional()
  @IsString()
  vendor_id?: string;
}
