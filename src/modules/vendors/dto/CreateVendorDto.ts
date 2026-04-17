import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { Role } from 'src/enums/role.enum';

export class CreateVendorDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  @Transform(({ value }: { value: string }) => value.trim())
  company_name!: string;

  @IsString()
  @IsOptional()
  @Length(2, 500)
  @Transform(({ value }: { value: string }) => value.trim())
  company_description?: string;
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  @Transform(({ value }: { value: string }) => value.trim())
  store_owner_first_name!: string;
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  @Transform(({ value }: { value: string }) => value.trim())
  store_owner_last_name!: string;
  @IsString()
  @IsNotEmpty()
  @Length(2, 4)
  country_code!: string;
  @IsString()
  @IsNotEmpty()
  @Length(10, 15)
  phone_number!: string;
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  @Transform(({ value }: { value: string }) => value.trim())
  category!: string;
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  @Transform(({ value }: { value: string }) => value.trim())
  company_structure!: string;
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  @Transform(({ value }: { value: string }) => value.trim())
  company_domain!: string;
  @IsString()
  @IsNotEmpty()
  @Length(8, 128)
  @Transform(({ value }: { value: string }) => value.trim())
  first_name!: string;
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  @Transform(({ value }: { value: string }) => value.trim())
  last_name!: string;
  @IsEmail()
  @IsNotEmpty()
  email!: string;
  @IsString()
  @IsNotEmpty()
  @Length(8, 128)
  @Transform(({ value }: { value: string }) => value.trim())
  password!: string;
  @IsString()
  @IsNotEmpty()
  @Length(8, 128)
  @Transform(({ value }: { value: string }) => value.trim())
  confirm_password!: string;
}
