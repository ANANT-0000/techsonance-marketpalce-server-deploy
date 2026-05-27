import { vendor } from './../../../drizzle/schema/users.schema';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsISO31661Alpha2,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
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

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: string }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  country_code!: string;

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
export class CreateComplianceDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompanyComplianceItemDto)
  company_compliance!: CompanyComplianceItemDto[];
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: string }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  vendor_id!: string;
}
// export class UploadComplianceDocumentDto implements CreateComplianceFieldDto {
//   @IsString()
//   @Trim()
//   compliance_field_id!: string;

//   @IsString()
//   @IsOptional()
//   @MaxLength(255)
//   @Trim()
//   label?: string;
// }
