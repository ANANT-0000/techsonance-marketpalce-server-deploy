import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class CreateVendorDto {
  @IsNotEmpty()
  @IsString()
  @Length(3, 100)
  @Transform(({ value }: { value: string }) => value.trim().toLowerCase())
  business_name!: string;

  @IsNotEmpty()
  @IsString()
  @Length(4, 15)
  @Transform(({ value }: { value: string }) => value.trim())
  business_number!: string;
  @IsNotEmpty()
  @IsString()
  @Length(3, 100)
  @Transform(({ value }: { value: string }) => value.trim())
  business_owner_full_name!: string;

  @IsNotEmpty()
  @IsString()
  category!: string;

  @IsNotEmpty()
  @IsString()
  country_code!: string;

  @IsNotEmpty()
  @IsString()
  phone_number!: string;

  @IsNotEmpty()
  @IsString()
  @Length(3, 100)
  vendor_admin_email!: string;

  @IsNotEmpty()
  @IsString()
  @Length(3, 100)
  vendor_admin_full_name!: string;

  @IsNotEmpty()
  @IsString()
  @Length(6, 100)
  password!: string;
}
