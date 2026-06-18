import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import {
  NavMenuLogoAlignment,
  NavMenuPosition,
} from '../../../drizzle/schema/nav_storefront.schema';

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
}
