import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';
import { Role } from 'src/enums/role.enum';

export class CreateVendorDto {
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim().toLowerCase())
  user_role!: Role;

  @IsNotEmpty()
  @IsString()
  @Length(3, 100)
  @Transform(({ value }: { value: string }) => value.trim().toLowerCase())
  store_name!: string;

  @IsNotEmpty()
  @IsString()
  @Length(3, 100)
  @Transform(({ value }: { value: string }) => value.trim())
  store_owner_first_name!: string;

  @IsNotEmpty()
  @IsString()
  @Length(3, 100)
  @Transform(({ value }: { value: string }) => value.trim())
  store_owner_last_name!: string;
  @IsNotEmpty()
  @IsString()
  category!: string;

  @IsNotEmpty()
  @IsString()
  @Length(2, 4)
  @Transform(({ value }: { value: string }) => value.trim().toUpperCase())
  country_code!: string;
  @IsNotEmpty()
  @IsString()
  @Length(4, 15)
  @Transform(({ value }: { value: string }) => value.trim())
  phone_number!: string;

  @IsNotEmpty()
  @IsString()
  @Length(3, 100)
  @IsEmail()
  @Transform(({ value }: { value: string }) => value.trim())
  email!: string;

  @IsNotEmpty()
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  @Length(3, 100)
  first_name!: string;

  @IsNotEmpty()
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  @Length(3, 100)
  last_name!: string;

  @IsNotEmpty()
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  @Length(6, 100)
  hash_password!: string;
}
