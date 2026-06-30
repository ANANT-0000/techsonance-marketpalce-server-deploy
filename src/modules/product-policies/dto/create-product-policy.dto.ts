import {
  IsString,
  IsEnum,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
} from 'class-validator';

import {
  PolicyDurationUnit,
  PolicyType,
  ReturnReplaceMode,
} from '../../../drizzle/types/types.js';

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
  @IsEnum(PolicyDurationUnit)
  duration_unit?: PolicyDurationUnit;

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
  @IsOptional()
  @IsBoolean()
  is_returnable?: boolean;
  @IsOptional()
  @IsBoolean()
  is_replaceable?: boolean;
  @IsOptional()
  @IsNumber()
  return_window_days?: number;
  @IsOptional()
  @IsNumber()
  replacement_window_days?: number;
  @IsOptional()
  @IsString()
  return_conditions?: string;
  @IsOptional()
  @IsEnum(ReturnReplaceMode)
  return_replace_mode?: ReturnReplaceMode;
}
