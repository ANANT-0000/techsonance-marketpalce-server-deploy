import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class CreateAddressDto {
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
  //   @IsNotEmpty()
  //   @IsString()
  //   @Transform(({ value }: { value: string }) => value.trim())
  //   country_code!: string;
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
