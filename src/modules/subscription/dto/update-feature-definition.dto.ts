import { IsString, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { FeatureValueType, EnforcementMode } from '../../../drizzle/types/types.js';

export class UpdateFeatureDefinitionDto {
  @IsString()
  @IsOptional()
  display_name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(FeatureValueType)
  @IsOptional()
  value_type?: FeatureValueType;

  @IsEnum(EnforcementMode)
  @IsOptional()
  enforcement_mode?: EnforcementMode;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
