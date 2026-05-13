import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
export class CompanyComplianceItemDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: string }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  field_key!: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: string }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  field_value!: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @IsString()
  @IsOptional()
  @Transform(({ value }: { value: string }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  valid_until?: string;
}
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
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompanyComplianceItemDto)
  company_compliance!: CompanyComplianceItemDto[];
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
