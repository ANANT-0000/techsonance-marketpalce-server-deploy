import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCheckoutDto {}
export class InitiateCheckoutDto {
  @IsString()
  @IsNotEmpty()
  addressId!: string;

  @IsString()
  @IsOptional()
  promotion_id!: string;

  @IsString()
  @IsNotEmpty()
  paymentMethod!: string;

  @IsOptional()
  @IsString()
  cartId?: string;

  @IsOptional()
  @IsString()
  productVariantId?: string;
}

export class VerifyCheckoutDto {
  @IsOptional()
  @IsString()
  promotionId?: string;

  @IsOptional()
  @Type(() => String)
  @IsString()
  discountApplied?: string;

  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @IsBoolean()
  @IsNotEmpty()
  isSuccess!: boolean;

  @IsOptional()
  @IsString()
  cartId?: string;

  @IsOptional()
  @IsString()
  productVariantId?: string;
}
