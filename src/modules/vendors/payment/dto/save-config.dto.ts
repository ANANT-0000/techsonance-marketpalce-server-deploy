import { IsString, IsEnum, IsOptional } from 'class-validator';
import { LogisticsMode } from '../../../../drizzle/types/types';
import { ShippingChargeStrategy } from '../../../../drizzle/types/types';

export class SavePaymentConfigDto {
  @IsString()
  @IsOptional()
  vendor_id?: string;

  @IsString()
  @IsOptional()
  razorpay_key_id?: string;

  @IsString()
  @IsOptional()
  razorpay_key_secret?: string;

  @IsString()
  @IsOptional()
  razorpay_webhook_secret?: string;

  @IsEnum(LogisticsMode)
  logistics_mode!: LogisticsMode;

  @IsEnum(ShippingChargeStrategy)
  shipping_charge_strategy!: ShippingChargeStrategy;
}
