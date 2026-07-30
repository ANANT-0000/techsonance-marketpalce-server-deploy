import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { NavItemKind, NavTemplateKey } from '../../../drizzle/types/types.js';

export class CreateTemplateItemDto {
  @IsNotEmpty()
  @IsEnum(NavItemKind)
  kind!: NavItemKind;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  key!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(120)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  path?: string | null;

  @IsOptional()
  @IsEnum(NavTemplateKey)
  template_key?: NavTemplateKey | null;

  @IsOptional()
  @IsBoolean()
  manual_override?: boolean;

  @IsOptional()
  @IsBoolean()
  is_pinned?: boolean;

  @IsOptional()
  @IsBoolean()
  is_hidden?: boolean;

  @IsOptional()
  config_schema?: Record<string, unknown>;
}

export class UpdateTemplateItemDto {
  @IsOptional()
  @IsEnum(NavItemKind)
  kind?: NavItemKind;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  key?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  path?: string | null;

  @IsOptional()
  @IsEnum(NavTemplateKey)
  template_key?: NavTemplateKey | null;

  @IsOptional()
  @IsBoolean()
  manual_override?: boolean;

  @IsOptional()
  @IsBoolean()
  is_pinned?: boolean;

  @IsOptional()
  @IsBoolean()
  is_hidden?: boolean;

  @IsOptional()
  config_schema?: Record<string, unknown>;
}
