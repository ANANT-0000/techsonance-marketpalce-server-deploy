import { IsBoolean, IsOptional, IsNumber, IsEnum } from 'class-validator';
import { ResetInterval } from '../../../drizzle/types/types.js';

export class UpdateFeatureLimitDto {
  @IsBoolean()
  is_enabled!: boolean;

  @IsBoolean()
  is_unlimited!: boolean;

  @IsOptional()
  @IsNumber()
  limit_value?: number | null;

  @IsOptional()
  @IsEnum(ResetInterval)
  reset_interval?: ResetInterval | null;
}
