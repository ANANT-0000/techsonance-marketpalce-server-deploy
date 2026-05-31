import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCheckoutDto {}
export class InitiateCheckoutDto {
  @IsString()
  @IsNotEmpty()
  addressId!: string;

  @IsString()
  @IsOptional()
  promotionId!: string;

  @IsString()
  @IsNotEmpty()
  paymentMethod!: string;

  @IsOptional()
  @IsString()
  cartId?: string;

  @IsOptional()
  @IsString()
  productVariantId?: string;

  @IsOptional()
  @IsNumber()
  qty?: number;
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
