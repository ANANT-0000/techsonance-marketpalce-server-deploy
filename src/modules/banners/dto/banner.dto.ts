import {
  IsString,
  IsOptional,
  IsUrl,
  IsNumber,
  IsBoolean,
  IsUUID,
  MinLength,
  MaxLength,
  Min,
  IsISO8601,
} from 'class-validator';

import { Transform, Type } from 'class-transformer';

export class CreateBannerDto {
  @Transform(({ value }) => value.toString().trim())
  @Type(() => String)
  placement!: string;

  @IsOptional()
  @IsString({ message: 'image_alt_text must be a string' })
  @MaxLength(200, { message: 'image_alt_text must not exceed 200 characters' })
  image_alt_text?: string;

  @IsOptional()
  @IsString({ message: 'headline must be a string' })
  @MinLength(3, { message: 'headline must be at least 3 characters' })
  @MaxLength(150, { message: 'headline must not exceed 150 characters' })
  headline?: string;

  @IsOptional()
  @IsString({ message: 'sub_headline must be a string' })
  @MaxLength(250, { message: 'sub_headline must not exceed 250 characters' })
  sub_headline?: string;

  @IsOptional()
  @IsString({ message: 'cta_label must be a string' })
  @MinLength(2, { message: 'cta_label must be at least 2 characters' })
  @MaxLength(50, { message: 'cta_label must not exceed 50 characters' })
  cta_label?: string;

  @IsOptional()
  @IsUrl({}, { message: 'cta_url must be a valid URL' })
  cta_url?: string;

  @IsOptional()
  @IsISO8601(
    { strict: true, strictSeparator: true },
    { message: 'valid_from must be a valid ISO 8601 date string' },
  )
  valid_from?: string;

  @IsOptional()
  @IsISO8601(
    { strict: true, strictSeparator: true },
    { message: 'valid_to must be a valid ISO 8601 date string' },
  )
  valid_to?: string;

  @IsOptional()
  @IsNumber({}, { message: 'display_order must be a number' })
  @Min(0, { message: 'display_order must be greater than or equal to 0' })
  display_order?: number;

  @IsOptional()
  @IsUUID('4', { message: 'promotion_id must be a valid UUID' })
  promotion_id?: string;

  @IsOptional()
  @IsBoolean({ message: 'is_active must be a boolean' })
  is_active?: boolean;

  @IsOptional()
  image_url!: Express.Multer.File;

  @IsOptional()
  image_url_mobile?: Express.Multer.File;
}
