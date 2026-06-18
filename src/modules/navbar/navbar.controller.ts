import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Patch,
} from '@nestjs/common';
import { NavbarService } from './navbar.service';
import { UpsertNavMenuDto } from './dto/upsert-nav-menu.dto';
import { CreateNavItemDto } from './dto/create-nav-item.dto';
import { UpdateNavItemDto, ReorderNavItemsDto } from './dto/update-nav-item.dto';
import { Public } from '../../common/decorators/public.decorator';

@Controller({ version: '1', path: 'navbar' })
export class NavbarController {
  constructor(private readonly navbarService: NavbarService) {}

  // ─── Public storefront endpoint ───────────────────────────────────────────

  /**
   * GET /v1/navbar
   * Public — no auth required.
   * Returns the full navbar config + ordered L1/L2 item tree for the domain.
   */
  @Public()
  @Get()
  getNavbar(@Headers('company-domain') domain: string) {
    return this.navbarService.getNavbar(domain);
  }

  // ─── Admin / vendor endpoints (JWT guard applied globally) ───────────────

  /**
   * PUT /v1/navbar/menu
   * Upserts scalar navbar settings (logo, behavior, search, utilities).
   * Patch semantics — only fields in the body are overwritten.
   */
  @Put('menu')
  upsertNavMenu(
    @Headers('company-domain') domain: string,
    @Body() dto: UpsertNavMenuDto,
  ) {
    return this.navbarService.upsertNavMenu(domain, dto);
  }

  /**
   * POST /v1/navbar/items
   * Creates an L1 nav link or L2 mega-menu column.
   */
  @Post('items')
  createNavItem(
    @Headers('company-domain') domain: string,
    @Body() dto: CreateNavItemDto,
  ) {
    return this.navbarService.createNavItem(domain, dto);
  }

  /**
   * PATCH /v1/navbar/items/:id
   * Partial update of a single nav item.
   */
  @Patch('items/:id')
  updateNavItem(
    @Headers('company-domain') domain: string,
    @Param('id') id: string,
    @Body() dto: UpdateNavItemDto,
  ) {
    return this.navbarService.updateNavItem(domain, id, dto);
  }

  /**
   * DELETE /v1/navbar/items/:id
   * Deletes an item. L1 deletion cascades to its L2 children via FK.
   */
  @Delete('items/:id')
  deleteNavItem(
    @Headers('company-domain') domain: string,
    @Param('id') id: string,
  ) {
    return this.navbarService.deleteNavItem(domain, id);
  }

  /**
   * PUT /v1/navbar/items/reorder
   * Bulk sort_order update for drag-and-drop reordering in the admin UI.
   * NOTE: must be declared BEFORE items/:id to avoid Express route shadowing.
   */
  @Put('items/reorder')
  reorderNavItems(
    @Headers('company-domain') domain: string,
    @Body() dto: ReorderNavItemsDto,
  ) {
    return this.navbarService.reorderNavItems(domain, dto);
  }
}
