import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateAddressDto {
  // @IsNotEmpty()
  // @IsString()
  // @Transform(({ value }: { value: string }) => value.trim())
  // user_id!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  address_for!: string;
  @IsOptional()
  @IsBoolean()
  is_default!: boolean;
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  name!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  phone!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  address_line_1!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  address_line_2!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  city!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  state!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  street!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  postal_code!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  country!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  landmark!: string;
}
