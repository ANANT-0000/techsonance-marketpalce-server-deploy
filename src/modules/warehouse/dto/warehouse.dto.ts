import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class warehouseAddressDto {
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  address_for!: string;
  @IsNotEmpty()
  @IsBoolean()
  is_default!: boolean;
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  name!: string;
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  phone!: string;
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  address_line_1!: string;
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  address_line_2!: string;
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  city!: string;
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  state!: string;
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  street!: string;
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  postal_code!: string;
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  country!: string;
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  landmark!: string;
}

export class updateWarehouseAddressDto {

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
