import {
  IsString,
  IsOptional,
  IsEmail,
  IsUrl,
  IsPhoneNumber,
  IsHexColor,
  IsBoolean,
  IsDateString,
  IsISO31661Alpha2,
  IsISO4217CurrencyCode,
  MinLength,
  MaxLength,
  IsArray,
} from 'class-validator';
import { Transform } from 'class-transformer';

// A reusable custom decorator for trimming strings to keep code clean
const Trim = () =>
  Transform(({ value }: { value: string }) =>
    typeof value === 'string' ? value.trim() : value,
  );

export class UpsertBrandingDto {
  @IsHexColor()
  @Trim()
  primary_color!: string;

  @IsHexColor()
  @Trim()
  secondary_color!: string;

  @IsHexColor()
  @Trim()
  accent_color!: string;

  @IsString()
  @Trim()
  @MaxLength(100)
  font_family!: string;

  @IsOptional()
  @IsString()
  @Trim()
  logo_url?: string;

  @IsOptional()
  @IsString()
  @Trim()
  logo_dark_url?: string;

  @IsOptional()
  @IsString()
  @Trim()
  watermark_url?: string;

  @IsOptional()
  @IsString()
  @Trim()
  favicon_url?: string;

  @IsOptional()
  @IsHexColor()
  @Trim()
  background_color?: string;

  @IsOptional()
  @IsHexColor()
  @Trim()
  text_color?: string;

  @IsOptional()
  @IsHexColor()
  @Trim()
  navbar_bg?: string;

  @IsOptional()
  @IsHexColor()
  @Trim()
  navbar_fg?: string;

  @IsOptional()
  @IsHexColor()
  @Trim()
  footer_bg?: string;

  @IsOptional()
  @IsHexColor()
  @Trim()
  footer_fg?: string;

  @IsOptional()
  @IsString()
  @Trim()
  navbar_position?: string;

  @IsOptional()
  @IsString()
  @Trim()
  logo_alignment?: string;

  @IsOptional()
  @IsString()
  @Trim()
  footer_style?: string;

  @IsOptional()
  @IsString()
  @Trim()
  border_radius?: string;

  @IsOptional()
  @IsString()
  @Trim()
  card_style?: string;

  @IsOptional()
  @IsArray()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      try {
        const parsedValue: unknown = JSON.parse(value);
        return parsedValue;
      } catch {
        return value.split(',').map((s) => s.trim());
      }
    }
    return value;
  })
  homepage_layout?: string[];
}

export class UpsertLegalProfileDto {
  @IsString()
  @Trim()
  @MinLength(2)
  @MaxLength(255)
  legal_name!: string;

  @IsString()
  @IsOptional()
  @Trim()
  @MinLength(2)
  @MaxLength(255)
  trade_name?: string;

  @IsISO31661Alpha2()
  @Trim()
  country_code!: string;

  @IsEmail()
  @Trim()
  @MaxLength(255)
  support_email!: string;

  @IsPhoneNumber()
  @Trim()
  support_phone!: string;

  @IsOptional()
  @IsUrl()
  @Trim()
  @MaxLength(2048) // Standard max URL length
  website_url!: string;

  @IsString()
  @Trim()
  registered_address_id!: string;
}

export class UpsertDocumentConfigDto {
  @IsString()
  @IsOptional()
  @Trim()
  @MaxLength(20)
  invoice_number_prefix?: string;

  @IsString()
  @IsOptional()
  @Trim()
  @MaxLength(50)
  invoice_number_format?: string;

  @IsString()
  @IsOptional()
  @Trim()
  @MaxLength(20)
  invoice_sequence_reset?: string;

  @IsISO4217CurrencyCode()
  @IsOptional()
  @Trim()
  default_currency?: string;

  @IsString()
  @IsOptional()
  @Trim()
  @MaxLength(50)
  default_timezone?: string;

  @IsString()
  @IsOptional()
  @Trim()
  @MaxLength(20)
  date_format?: string;

  @IsString()
  @IsOptional()
  @Trim()
  @MaxLength(255)
  signatory_name?: string;

  @IsString()
  @IsOptional()
  @Trim()
  @MaxLength(255)
  signatory_designation?: string;

  @IsString()
  @IsOptional()
  @Trim()
  @MaxLength(1000) // Footers can be fairly long
  invoice_footer_text?: string;

  @IsString()
  @IsOptional()
  @Trim()
  @MaxLength(5000) // T&Cs are usually paragraphs of text
  invoice_terms_and_conditions?: string;

  @IsString()
  @IsOptional()
  @Trim()
  default_invoice_template_id?: string;
}
export class UpsertComplianceFieldDto {
  @IsISO31661Alpha2()
  @Trim()
  country_code!: string;

  @IsString()
  @Trim()
  @MaxLength(100)
  field_key!: string;

  @IsString()
  @Trim()
  @MaxLength(1000) // Compliance values might be longer strings/JSON
  field_value!: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @IsDateString()
  @IsOptional()
  @Trim()
  valid_until?: string | null;

  @IsString()
  @IsOptional()
  @Trim()
  document_id?: string | null;
}
