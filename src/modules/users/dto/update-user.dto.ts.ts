import { Transform } from "class-transformer";
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from "class-validator";

export class UpdateUserDtoTs {
  @IsNotEmpty()
  @IsString()
  @IsOptional()
  @Length(4, 64)
  @Transform(({ value }: { value: string }) => value.trim().toLowerCase())
  first_name?: string;

  @IsNotEmpty()
  @IsString()
  @IsOptional()
  @Length(4, 64)
  @Transform(({ value }: { value: string }) => value.trim().toLowerCase())
  last_name?: string;

  @IsNotEmpty()
  @IsString()
  @IsOptional()
  @MaxLength(64)
  @IsEmail()
  @Transform(({ value }: { value: string }) => value.trim().toLowerCase())
  email?: string;

  @IsNotEmpty()
  @IsString()
  @IsOptional()
  @MaxLength(3)
  country_code?: string;

  @IsNotEmpty()
  @IsString()
  @IsOptional()
  @Length(4, 12)
  @Transform(({ value }: { value: string }) => value.trim())
  phone_number?: string;
}
