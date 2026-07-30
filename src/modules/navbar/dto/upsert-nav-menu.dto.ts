import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  IsArray,
  ValidateNested,
  ArrayNotEmpty,
  IsIn,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  NavItemDisplayType,
  NavMenuLogoAlignment,
  NavMenuLinksAlignment,
  NavMenuPosition,
} from '../../../drizzle/schema/enums.schema.js';
import * as nav_storefrontSchema from '../../../drizzle/schema/nav_storefront.schema.js';

export class AnnouncementItemDto {
  @IsString()
  id!: string;

  @IsIn(['text', 'link', 'feature'])
  type!: nav_storefrontSchema.AnnouncementItemType;

  @IsString()
  label!: string;

  @ValidateIf((_, v) => v !== undefined)
  @IsString()
  target_route?: string;

  @ValidateIf((_, v) => v !== undefined)
  @IsString()
  feature_key?: string;

  @ValidateIf((_, v) => v !== undefined)
  @IsArray()
  @ArrayNotEmpty({ message: 'Item must be visible on at least one device.' })
  @IsEnum(['desktop', 'mobile'], { each: true })
  visible_on?: ('desktop' | 'mobile')[];

  @ValidateIf((_, v) => v !== undefined)
  @IsBoolean()
  is_highlighted?: boolean;
}

/** DTO for upserting the scalar navbar settings (logo, behavior, search, utilities). */
export class UpsertNavMenuDto {
  // ── Logo ────────────────────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  logo_src?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  logo_alt?: string;

  @IsOptional()
  @IsString()
  logo_href?: string;

  @IsOptional()
  @IsEnum(NavMenuLogoAlignment)
  logo_alignment?: NavMenuLogoAlignment;

  @IsOptional()
  @IsEnum(NavMenuLinksAlignment)
  links_alignment?: NavMenuLinksAlignment;

  // ── Behavior ────────────────────────────────────────────────────────────
  @IsOptional()
  @IsEnum(NavMenuPosition)
  position?: NavMenuPosition;

  @IsOptional()
  @IsBoolean()
  show_shadow?: boolean;

  @IsOptional()
  @IsBoolean()
  show_border?: boolean;

  // ── Search bar ──────────────────────────────────────────────────────────
  @IsOptional()
  @IsBoolean()
  search_visible?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search_placeholder?: string;

  @IsOptional()
  @IsString()
  search_endpoint?: string;

  // ── Utility icons ───────────────────────────────────────────────────────
  @IsOptional()
  @IsBoolean()
  show_account?: boolean;

  @IsOptional()
  @IsBoolean()
  show_wishlist?: boolean;

  @IsOptional()
  @IsBoolean()
  show_cart?: boolean;

  // ── Announcement Bar ────────────────────────────────────────────────────
  @IsOptional()
  @IsBoolean()
  announcement_visible?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnnouncementItemDto)
  announcement_items_left?: AnnouncementItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnnouncementItemDto)
  announcement_items_right?: AnnouncementItemDto[];

  @IsOptional()
  @IsString()
  announcement_bg_color?: string;

  @IsOptional()
  @IsString()
  announcement_text_color?: string;

  @IsOptional()
  @IsString()
  announcement_text_size?: string;

  @IsOptional()
  @IsString()
  announcement_mobile_alignment?: string;
}
