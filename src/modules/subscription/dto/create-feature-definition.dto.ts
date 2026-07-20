import { IsString, IsNotEmpty, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { FeatureValueType, EnforcementMode } from '../../../drizzle/types/types.js';

export class CreateFeatureDefinitionDto {
  @IsString()
  @IsNotEmpty()
  feature_key!: string;

  @IsString()
  @IsNotEmpty()
  display_name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(FeatureValueType)
  value_type!: FeatureValueType;

  @IsEnum(EnforcementMode)
  @IsOptional()
  enforcement_mode?: EnforcementMode;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
