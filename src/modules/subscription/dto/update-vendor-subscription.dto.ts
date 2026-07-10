import { IsString, IsEnum, IsOptional, IsDateString } from 'class-validator';
import { SubscriptionStatus } from '../../../drizzle/types/types.js';

export class UpdateVendorSubscriptionDto {
  @IsOptional()
  @IsString()
  plan_id?: string;

  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @IsOptional()
  @IsOptional()
  @IsDateString()
  trial_starts_at?: string | null;

  @IsOptional()
  @IsDateString()
  trial_ends_at?: string | null;

  @IsOptional()
  @IsDateString()
  current_period_start?: string | null;

  @IsOptional()
  @IsDateString()
  current_period_end?: string | null;

  @IsOptional()
  @IsDateString()
  grace_period_ends_at?: string | null;

  @IsOptional()
  @IsDateString()
  cancelled_at?: string | null;
}
