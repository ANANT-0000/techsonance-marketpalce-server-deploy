import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  NavItemType,
  NavItemDisplayType,
  NavItemColType,
} from '../../../drizzle/schema/nav_storefront.schema';
import { NavLayoutType } from '../../../drizzle/types/types';

/** Promo block — only required when col_type = PROMOTION */
export class NavItemPromoDto {
  @IsOptional()
  @IsString()
  promo_image_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  promo_title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  promo_subtitle?: string;

  @IsOptional()
  @IsString()
  promo_cta_href?: string;
}

/** Meta bag — validated but not mapped to individual DB columns. */
export class NavItemMetaDto {
  // L1 mega-menu source
  @IsOptional()
  @IsEnum(NavItemDisplayType)
  display_type?: NavItemDisplayType;

  @IsOptional()
  @IsBoolean()
  show_category_icons?: boolean;

  /** UUID string — service validates FK existence */
  @IsOptional()
  @IsUUID()
  parent_category_id?: string;

  // L2 column
  @IsOptional()
  @IsEnum(NavItemColType)
  col_type?: NavItemColType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  col_title?: string;

  // L2 promo
  @IsOptional()
  @IsString()
  promo_image_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  promo_title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  promo_subtitle?: string;

  @IsOptional()
  @IsString()
  promo_cta_href?: string;

  // Per-item icon
  @IsOptional()
  @IsString()
  icon_url?: string;
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  product_ids?: string[];
}

export class CreateNavItemDto {
  /** UUID of the nav_menus row this item belongs to. */
  @IsUUID()
  @IsNotEmpty()
  menu_id: string;

  /**
   * NULL → L1 item. UUID → L2 column under the given L1 item.
   * Service validates: parent must be an L1 item (not another L2).
   */
  @IsOptional()
  @IsUUID()
  parent_id?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label: string;

  @IsString()
  @IsNotEmpty()
  href: string;

  @IsEnum(NavItemType)
  item_type: NavItemType;

  /** FK to categories — required when item_type = 'category'. */
  @ValidateIf((o) => o.item_type === NavItemType.CATEGORY)
  @IsUUID()
  category_id?: string;

  @IsBoolean()
  has_mega_menu: boolean;

  @IsOptional()
  @IsEnum(NavLayoutType)
  layout_type?: NavLayoutType;

  @IsOptional()
  @IsString()
  target_route?: string;

  @IsOptional()
  @IsUUID()
  root_category_id?: string | null;

  @IsOptional()
  sort_order?: number;

  /** Sparse config bag for L1/L2 specific options. */
  @IsOptional()
  @ValidateNested()
  @Type(() => NavItemMetaDto)
  meta?: NavItemMetaDto;
}
