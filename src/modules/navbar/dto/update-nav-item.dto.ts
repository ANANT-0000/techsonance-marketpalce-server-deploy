import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateNavItemDto } from './create-nav-item.dto';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

/**
 * UpdateNavItemDto — all fields optional except menu_id is omitted
 * (items cannot be moved between menus; delete + recreate instead).
 */
export class UpdateNavItemDto extends PartialType(
  OmitType(CreateNavItemDto, ['menu_id'] as const),
) {}

/** Single entry in a reorder request. */
export class ReorderEntryDto {
  @IsUUID()
  id: string;

  sort_order: number;
}

/** Bulk sort_order update for items within the same parent. */
export class ReorderNavItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  items: ReorderEntryDto[];
}
