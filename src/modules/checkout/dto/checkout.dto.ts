import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCheckoutDto {}
export class InitiateCheckoutDto {
  @IsString()
  @IsNotEmpty()
  addressId!: string;

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
