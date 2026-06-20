import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import {
  categories,
  nav_items,
  nav_menus,
  products,
} from '../../drizzle/schema';
import { CompanyService } from '../company/company.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { NavbarErrorKeyEnum } from './constants/navbar.enums';
import { UpsertNavMenuDto } from './dto/upsert-nav-menu.dto';
import { CreateNavItemDto } from './dto/create-nav-item.dto';
import {
  UpdateNavItemDto,
  ReorderNavItemsDto,
} from './dto/update-nav-item.dto';
import {
  NavMenuSettings,
  NavMenuLogoAlignment,
  NavMenuPosition,
  NavItemMeta,
  NavItemDisplayType,
  NavItemColType,
  NavItemType,
} from '../../drizzle/schema/nav_storefront.schema';
import { SiteMapsService } from '../site-maps/site-maps.service';

// ─── Default settings applied when a field is absent from the JSONB blob ────
const SETTINGS_DEFAULTS: Required<NavMenuSettings> = {
  logo_src: '',
  logo_alt: 'Store Logo',
  logo_href: '/',
  logo_alignment: NavMenuLogoAlignment.LEFT,
  position: NavMenuPosition.STICKY,
  show_shadow: true,
  show_border: true,
  search_visible: true,
  search_placeholder: 'Search products...',
  search_endpoint: '/store/search',
  show_account: true,
  show_wishlist: true,
  show_cart: true,
};
const MEGA_MENU_MAX_AUTO_COLUMNS = 6;
const MEGA_MENU_SUBTREE_DEPTH = 2;

@Injectable()
export class NavbarService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
    private readonly siteMapsService: SiteMapsService,
  ) {}

  // ─── Internal helpers ───────────────────────────────────────────────────────

  private async resolveCompanyId(domain: string): Promise<string> {
    try {
      return await this.companyService.find(domainExtractor(domain));
    } catch (err) {
      throw new InternalServerErrorException(
        NavbarErrorKeyEnum.FAILED_TO_RESOLVE_COMPANY,
        { cause: err },
      );
    }
  }
  private buildCategoryHref(
    routeKey: string | undefined,
    slug: string,
    routeMap: Map<
      string,
      { base_path: string; default_query_param: string | null }
    >,
  ): string {
    const route = routeMap.get(routeKey ?? 'store') ?? routeMap.get('store');

    if (!route) {
      return `/store?category=${encodeURIComponent(slug)}`;
    }

    const basePath = route.base_path.replace(/\/+$/, '');
    const param = route.default_query_param?.trim() || 'category';
    const separator = basePath.includes('?') ? '&' : '?';

    return `${basePath}${separator}${param}=${encodeURIComponent(slug)}`;
  }
  private resolveCategorySubtree(
    categoryId: string,
    categoryChildrenMap: Map<string, (typeof categories.$inferSelect)[]>,
    routeMap: Map<
      string,
      { base_path: string; default_query_param: string | null }
    >,
    routeKey: string | undefined,
    depth = 0,
  ): any[] {
    if (depth >= MEGA_MENU_SUBTREE_DEPTH) return [];
    return (categoryChildrenMap.get(categoryId) ?? []).map((sub) => ({
      id: sub.id,
      label: sub.name,
      href: this.buildCategoryHref(routeKey, sub.slug, routeMap), // ← was hardcoded /store
      item_type: 'category',
      category_id: sub.id,
      icon_url: sub.icon_url || undefined,
      children: this.resolveCategorySubtree(
        sub.id,
        categoryChildrenMap,
        routeMap,
        routeKey,
        depth + 1,
      ),
    }));
  }
  private resolveProductIds(
    ids: string[] | undefined,
    productMap: Map<string, { id: string; name: string }>,
  ) {
    return (ids ?? [])
      .map((id) => productMap.get(id))
      .filter((p): p is { id: string; name: string } => !!p)
      .map((p) => ({
        id: p.id,
        label: p.name,
        href: `/store/product/${p.id}`,
        item_type: 'product',
      }));
  }
  /**
   * Returns the nav_menus row for a company, or null if it has never been
   * saved. Public GET uses null → defaults; admin PUT upserts the row.
   */
  private async findMenuRow(companyId: string) {
    const [row] = await this.db
      .select()
      .from(nav_menus)
      .where(eq(nav_menus.company_id, companyId))
      .limit(1)
      .catch((err) => {
        throw new InternalServerErrorException(
          NavbarErrorKeyEnum.FAILED_TO_FETCH_MENU,
          { cause: err },
        );
      });
    return row ?? null;
  }

  /** Merge stored settings with defaults so the client always gets a full object. */
  private mergeDefaults(
    stored: NavMenuSettings = {},
  ): Required<NavMenuSettings> {
    return { ...SETTINGS_DEFAULTS, ...stored };
  }

  // ─── Public: storefront GET ─────────────────────────────────────────────────

  /**
   * GET /v1/navbar
   *
   * Returns the complete navbar config and ordered item tree.
   * Response shape is consumed directly by useNavbarData.ts on the frontend.
   */
  /**
   * GET /v1/navbar
   *
   * Returns the complete navbar config and ordered item tree.
   * Response shape is consumed directly by useNavbarData.ts on the frontend.
   */
  async getNavbar(domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const routeMap = await this.siteMapsService.getRouteMap(domain);
      // Fetch menu row first — items query needs the menu id
      const menuRow = await this.findMenuRow(companyId);

      // Fetch all items for this menu ordered for rendering
      const items = await this.db
        .select()
        .from(nav_items)
        .where(eq(nav_items.menu_id, menuRow?.id ?? ''))
        .orderBy(asc(nav_items.sort_order))
        .catch((): (typeof nav_items.$inferSelect)[] => []);

      const settings = this.mergeDefaults(menuRow?.settings as NavMenuSettings);

      // Fetch all categories for this company to resolve details without N+1 queries
      const dbCategories = menuRow
        ? await this.db
            .select()
            .from(categories)
            .where(eq(categories.company_id, companyId))
            .catch(() => [])
        : [];

      // Extract target product IDs explicitly referenced in the menu items (e.g. meta.product_ids)
      const productIds = items
        .map((item) => (item.meta as NavItemMeta)?.product_ids)
        .filter((ids): ids is string[] => Array.isArray(ids))
        .flat();

      // Fetch only products explicitly referenced in the menu items to avoid unconstrained DB reads
      const dbProducts = menuRow && productIds.length > 0
        ? await this.db
            .select({ id: products.id, name: products.name })
            .from(products)
            .where(inArray(products.id, productIds))
            .catch(() => [])
        : [];
      const productMap = new Map(dbProducts.map((p) => [p.id, p]));

      // Build category hierarchy lookup maps in memory
      const categoryMap = new Map<string, typeof categories.$inferSelect>();
      const categoryChildrenMap = new Map<
        string,
        (typeof categories.$inferSelect)[]
      >();

      dbCategories.forEach((cat) => {
        categoryMap.set(cat.id, cat);
        if (cat.parent_id) {
          if (!categoryChildrenMap.has(cat.parent_id)) {
            categoryChildrenMap.set(cat.parent_id, []);
          }
          categoryChildrenMap.get(cat.parent_id)!.push(cat);
        }
      });

      // Helper to dynamically resolve labels/hrefs for category-type items
      const resolveCategory = (
        itemId,
        itemType,
        categoryId,
        label,
        href,
        routeKey?: string,
      ) => {
        if (itemType === NavItemType.CATEGORY && categoryId) {
          const cat = categoryMap.get(categoryId);
          if (cat) {
            return {
              label: label || cat.name,
              href: this.buildCategoryHref(routeKey, cat.slug, routeMap),
              icon_url: cat.icon_url || undefined,
            };
          }
        }
        return { label, href };
      };

      // Separate L1 and L2 items
      const l1Items = items.filter((i) => !i.parent_id);
      const l2Items = items.filter((i) => !!i.parent_id);

      // Build L2 lookup keyed by parent_id
      const l2ByParent = l2Items.reduce<Record<string, typeof l2Items>>(
        (acc, item) => {
          const key = item.parent_id!;
          if (!acc[key]) acc[key] = [];
          acc[key].push(item);
          return acc;
        },
        {},
      );

      return {
        settings,
        menu_id: menuRow?.id ?? null,
        navigationItems: l1Items.map((l1) => {
          const routeKey = l1.meta?.route_key;
          const { label: resolvedLabel, href: resolvedHref } = resolveCategory(
            l1.id,
            l1.item_type,
            l1.category_id,
            l1.label,
            l1.href,
            routeKey,
          );

          let columns: any[] = [];
          if (l1.has_mega_menu) {
            const displayType = l1.meta?.display_type;

            if (
              l1.has_mega_menu &&
              l1.meta?.display_type ===
                NavItemDisplayType.DYNAMIC_SUBCATEGORIES &&
              l1.meta?.parent_category_id
            ) {
              const autoColumns = (
                categoryChildrenMap.get(l1.meta.parent_category_id) ?? []
              )
                .slice(0, MEGA_MENU_MAX_AUTO_COLUMNS)
                .map((childCat, idx) => ({
                  id: childCat.id,
                  label: childCat.name,
                  href: this.buildCategoryHref(
                    l1.meta?.route_key,
                    childCat.slug,
                    routeMap,
                  ),
                  item_type: NavItemType.CATEGORY,
                  category_id: childCat.id,
                  sort_order: 1000 + idx,
                  meta: {
                    col_type: NavItemColType.SUBCATEGORIES,
                    col_title: childCat.name,
                    icon_url: childCat.icon_url || undefined,
                  },
                  items: this.resolveCategorySubtree(
                    childCat.id,
                    categoryChildrenMap,
                    routeMap,
                    l1.meta?.route_key,
                  ),
                }));
              const manualColumns = (l2ByParent[l1.id] ?? []).map((l2) => ({
                id: l2.id,
                label: l2.label,
                href: l2.href,
                item_type: l2.item_type,
                category_id: l2.category_id,
                sort_order: l2.sort_order,
                meta: (l2.meta ?? {}) as NavItemMeta,
                items:
                  l2.meta?.col_type === NavItemColType.PRODUCTS
                    ? this.resolveProductIds(
                        (l2.meta as any)?.product_ids,
                        productMap,
                      )
                    : [],
              }));

              columns = [...manualColumns, ...autoColumns].sort(
                (a, b) => a.sort_order - b.sort_order,
              );
            } else if (
              displayType === NavItemDisplayType.CATEGORY_LISTING ||
              (displayType as string) === 'category_listing_visual'
            ) {
              const curatedCols = (l2ByParent[l1.id] ?? []).map((l2) => {
                const {
                  label: rLabel,
                  href: rHref,
                  icon_url: rIconUrl,
                } = resolveCategory(
                  l2.id,
                  l2.item_type,
                  l2.category_id,
                  l2.label,
                  l2.href,
                  routeKey,
                );
                let resolvedSubItems: any[] = [];
                if (l2.item_type === NavItemType.CATEGORY && l2.category_id) {
                  const subCats = categoryChildrenMap.get(l2.category_id) ?? [];
                  resolvedSubItems = subCats.map((sub) => ({
                    id: sub.id,
                    label: sub.name,
                    href: this.buildCategoryHref(
                      l1.meta?.route_key || routeKey,
                      sub.slug,
                      routeMap,
                    ),
                    item_type: NavItemType.CATEGORY,
                    category_id: sub.id,
                    icon_url: sub.icon_url || undefined,
                  }));
                } else {
                  // Fall back to manual L3 child items for custom columns
                  resolvedSubItems = (l2ByParent[l2.id] ?? []).map((l3) => {
                    const {
                      label: rL3Label,
                      href: rL3Href,
                      icon_url: rL3IconUrl,
                    } = resolveCategory(
                      l3.id,
                      l3.item_type,
                      l3.category_id,
                      l3.label,
                      l3.href,
                      routeKey,
                    );
                    return {
                      id: l3.id,
                      label: rL3Label,
                      href: rL3Href,
                      item_type: l3.item_type,
                      category_id: l3.category_id,
                      sort_order: l3.sort_order,
                      meta: {
                        ...l3.meta,
                        icon_url: rL3IconUrl || l3.meta?.icon_url || undefined,
                      },
                    };
                  });
                }
                return {
                  id: l2.id,
                  label: rLabel,
                  href: rHref,
                  item_type: l2.item_type,
                  category_id: l2.category_id,
                  sort_order: l2.sort_order,
                  meta: {
                    ...((l2.meta ?? {}) as NavItemMeta),
                    icon_url: rIconUrl || l2.meta?.icon_url || undefined,
                  },
                  items: resolvedSubItems,
                };
              });

              if (curatedCols.length > 0) {
                columns = curatedCols;
              } else {
                // Fallback to all root categories chunked
                const rootCats = dbCategories.filter((c) => !c.parent_id);
                if (rootCats.length > 0) {
                  const maxCols = Math.min(4, rootCats.length);
                  const colSize = Math.ceil(rootCats.length / maxCols);
                  for (let i = 0; i < maxCols; i++) {
                    const chunk = rootCats.slice(
                      i * colSize,
                      (i + 1) * colSize,
                    );
                    columns.push({
                      id: `fallback-col-${i}`,
                      label: i === 0 ? 'Categories' : '',
                      href: this.buildCategoryHref(
                        l1.meta?.route_key || routeKey,
                        '',
                        routeMap,
                      ),
                      item_type: NavItemType.CATEGORY,
                      category_id: null,
                      sort_order: i,
                      meta: {
                        col_type: 'subcategories',
                        col_title: i === 0 ? 'Categories' : '',
                      },
                      items: chunk.map((cat) => ({
                        id: cat.id,
                        label: cat.name,
                        href: this.buildCategoryHref(
                          l1.meta?.route_key || routeKey,
                          cat.slug,
                          routeMap,
                        ),
                        item_type: NavItemType.CATEGORY,
                        category_id: cat.id,
                        icon_url: cat.icon_url || undefined,
                      })),
                    });
                  }
                }
              }
            } else if (
              l1.meta?.display_type === NavItemDisplayType.CATEGORY_DIRECTORY
            ) {
              const routeKey = l1.meta?.route_key;
              const rootCats = dbCategories.filter((c) => !c.parent_id);

              columns = rootCats
                .slice(0, MEGA_MENU_MAX_AUTO_COLUMNS)
                .map((root, idx) => ({
                  id: root.id,
                  label: root.name,
                  href: this.buildCategoryHref(routeKey, root.slug, routeMap),
                  item_type: NavItemType.CATEGORY,
                  category_id: root.id,
                  sort_order: idx,
                  meta: {
                    col_type: 'subcategories',
                    col_title: root.name,
                    icon_url: root.icon_url || undefined,
                  },
                  items: this.resolveCategorySubtree(
                    root.id,
                    categoryChildrenMap,
                    routeMap,
                    routeKey,
                  ),
                }));
            } else {
              // Default or custom/manual columns (such as manual product ranges)
              columns = (l2ByParent[l1.id] ?? []).map((l2) => {
                const { label: rLabel, href: rHref } = resolveCategory(
                  l2.id,
                  l2.item_type,
                  l2.category_id,
                  l2.label,
                  l2.href,
                  routeKey,
                );

                // Fetch manual L3 child items
                const subItems =
                  l2.meta?.col_type === NavItemColType.PRODUCTS
                    ? this.resolveProductIds(
                        (l2.meta as any)?.product_ids,
                        productMap,
                      )
                    : (l2ByParent[l2.id] ?? []).map((l3) => {
                        const { label: rL3Label, href: rL3Href } =
                          resolveCategory(
                            l3.id,
                            l3.item_type,
                            l3.category_id,
                            l3.label,
                            l3.href,
                            routeKey,
                          );
                        return {
                          id: l3.id,
                          label: rL3Label,
                          href: rL3Href,
                          item_type: l3.item_type,
                          category_id: l3.category_id,
                          sort_order: l3.sort_order,
                          meta: l3.meta,
                        };
                      });
                return {
                  id: l2.id,
                  label: rLabel,
                  href: rHref,
                  item_type: l2.item_type,
                  category_id: l2.category_id,
                  sort_order: l2.sort_order,
                  meta: (l2.meta ?? {}) as NavItemMeta,
                  items: subItems,
                };
              });
            }
          }
          return {
            id: l1.id,
            label: resolvedLabel,
            href: resolvedHref,
            item_type: l1.item_type,
            category_id: l1.category_id,
            has_mega_menu: l1.has_mega_menu,
            sort_order: l1.sort_order,
            meta: (l1.meta ?? {}) as NavItemMeta,
            megaMenuColumns: columns,
          };
        }),
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new InternalServerErrorException(
        NavbarErrorKeyEnum.FAILED_TO_FETCH_MENU,
        { cause: err },
      );
    }
  }

  // ─── Admin: upsert scalar menu settings ────────────────────────────────────

  /**
   * PUT /v1/navbar/menu
   *
   * Merges the incoming settings patch into the stored JSONB blob.
   * Creates the nav_menus row on first save (upsert semantics).
   */
  async upsertNavMenu(domain: string, dto: UpsertNavMenuDto) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const existing = await this.findMenuRow(companyId);

      // Merge: existing stored settings → dto fields (only defined keys)
      const patch: NavMenuSettings = {
        ...((existing?.settings as NavMenuSettings) ?? {}),
      };
      (Object.keys(dto) as (keyof UpsertNavMenuDto)[]).forEach((key) => {
        if (dto[key] !== undefined) (patch as any)[key] = dto[key];
      });

      if (existing) {
        await this.db
          .update(nav_menus)
          .set({ settings: patch, updated_at: new Date() })
          .where(eq(nav_menus.id, existing.id))
          .catch((err) => {
            throw new InternalServerErrorException(
              NavbarErrorKeyEnum.FAILED_TO_UPSERT_MENU,
              { cause: err },
            );
          });
        return {
          success: true,
          status: HttpStatus.OK,
          message: 'Navbar settings updated.',
        };
      }

      await this.db
        .insert(nav_menus)
        .values({ company_id: companyId, settings: patch })
        .catch((err) => {
          throw new InternalServerErrorException(
            NavbarErrorKeyEnum.FAILED_TO_UPSERT_MENU,
            { cause: err },
          );
        });
      return {
        success: true,
        status: HttpStatus.CREATED,
        message: 'Navbar settings created.',
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new InternalServerErrorException(
        NavbarErrorKeyEnum.FAILED_TO_UPSERT_MENU,
        { cause: err },
      );
    }
  }

  // ─── Admin: nav item CRUD ───────────────────────────────────────────────────

  /**
   * POST /v1/navbar/items
   *
   * Creates an L1 link (parent_id = null) or an L2 mega-menu column
   * (parent_id = <L1 item id>).
   *
   * Guards:
   *  • menu_id must belong to the requesting company
   *  • if parent_id is set, the parent must be an L1 item (not another L2)
   *  • L2 items cannot have has_mega_menu = true
   */
  async createNavItem(domain: string, dto: CreateNavItemDto) {
    try {
      const companyId = await this.resolveCompanyId(domain);

      // Verify the menu belongs to this company
      const menuRow = await this.findMenuRow(companyId);
      if (!menuRow || menuRow.id !== dto.menu_id) {
        throw new NotFoundException(NavbarErrorKeyEnum.MENU_NOT_FOUND);
      }

      // If creating an L2 item, validate parent depth
      if (dto.parent_id) {
        const [parent] = await this.db
          .select({ id: nav_items.id, parent_id: nav_items.parent_id })
          .from(nav_items)
          .where(eq(nav_items.id, dto.parent_id))
          .limit(1);

        if (!parent)
          throw new NotFoundException(NavbarErrorKeyEnum.ITEM_NOT_FOUND);
        // Parent must itself be an L1 item
        if (parent.parent_id)
          throw new BadRequestException(
            NavbarErrorKeyEnum.INVALID_PARENT_DEPTH,
          );
        // L2 items cannot open a mega menu
        if (dto.has_mega_menu)
          throw new BadRequestException(
            NavbarErrorKeyEnum.MEGA_MENU_ON_CHILD_ITEM,
          );
      }

      const [created] = await this.db
        .insert(nav_items)
        .values({
          menu_id: dto.menu_id,
          parent_id: dto.parent_id ?? null,
          label: dto.label,
          href: dto.href,
          item_type: dto.item_type as any,
          category_id: dto.category_id ?? null,
          has_mega_menu: dto.has_mega_menu,
          sort_order: dto.sort_order ?? 0,
          meta: (dto.meta ?? {}) as NavItemMeta,
        })
        .returning()
        .catch((err) => {
          throw new InternalServerErrorException(
            NavbarErrorKeyEnum.FAILED_TO_CREATE_ITEM,
            { cause: err },
          );
        });

      return { success: true, data: created };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new InternalServerErrorException(
        NavbarErrorKeyEnum.FAILED_TO_CREATE_ITEM,
        { cause: err },
      );
    }
  }

  /**
   * PATCH /v1/navbar/items/:id
   *
   * Applies a partial patch to a single nav_items row.
   * Validates ownership via menu → company chain.
   */
  async updateNavItem(domain: string, itemId: string, dto: UpdateNavItemDto) {
    try {
      if (!itemId || !itemId.match(/^[0-9a-f-]{36}$/i)) {
        throw new BadRequestException('Invalid item ID');
      }

      const companyId = await this.resolveCompanyId(domain);
      const menuRow = await this.findMenuRow(companyId);
      if (!menuRow)
        throw new NotFoundException(NavbarErrorKeyEnum.MENU_NOT_FOUND);

      // Confirm item belongs to this company's menu
      const [existing] = await this.db
        .select({
          id: nav_items.id,
          parent_id: nav_items.parent_id,
          meta: nav_items.meta,
        })
        .from(nav_items)
        .where(and(eq(nav_items.id, itemId), eq(nav_items.menu_id, menuRow.id)))
        .limit(1);

      if (!existing)
        throw new NotFoundException(NavbarErrorKeyEnum.ITEM_NOT_FOUND);

      // Build patch — only set fields that were provided
      const patch: Partial<typeof nav_items.$inferInsert> = {};
      if (dto.label !== undefined) patch.label = dto.label;
      if (dto.href !== undefined) patch.href = dto.href;
      if (dto.item_type !== undefined) patch.item_type = dto.item_type as any;
      if (dto.category_id !== undefined)
        patch.category_id = dto.category_id ?? null;
      if (dto.has_mega_menu !== undefined)
        patch.has_mega_menu = dto.has_mega_menu;
      if (dto.sort_order !== undefined) patch.sort_order = dto.sort_order;

      // Merge meta JSONB — don't overwrite entire blob with partial update
      if (dto.meta !== undefined) {
        patch.meta = {
          ...((existing.meta as NavItemMeta) ?? {}),
          ...dto.meta,
        } as NavItemMeta;
      }

      patch.updated_at = new Date();

      const [updated] = await this.db
        .update(nav_items)
        .set(patch)
        .where(eq(nav_items.id, itemId))
        .returning()
        .catch((err) => {
          throw new InternalServerErrorException(
            NavbarErrorKeyEnum.FAILED_TO_UPDATE_ITEM,
            { cause: err },
          );
        });

      return { success: true, data: updated };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new InternalServerErrorException(
        NavbarErrorKeyEnum.FAILED_TO_UPDATE_ITEM,
        { cause: err },
      );
    }
  }

  /**
   * DELETE /v1/navbar/items/:id
   *
   * Deletes an item. If the item is L1 and has L2 children, the CASCADE
   * FK on parent_id removes all children automatically.
   */
  async deleteNavItem(domain: string, itemId: string) {
    try {
      if (!itemId || !itemId.match(/^[0-9a-f-]{36}$/i)) {
        throw new BadRequestException('Invalid item ID');
      }

      const companyId = await this.resolveCompanyId(domain);
      const menuRow = await this.findMenuRow(companyId);
      if (!menuRow)
        throw new NotFoundException(NavbarErrorKeyEnum.MENU_NOT_FOUND);

      const deleted = await this.db
        .delete(nav_items)
        .where(and(eq(nav_items.id, itemId), eq(nav_items.menu_id, menuRow.id)))
        .returning({ id: nav_items.id })
        .catch((err) => {
          throw new InternalServerErrorException(
            NavbarErrorKeyEnum.FAILED_TO_DELETE_ITEM,
            { cause: err },
          );
        });

      if (!deleted.length)
        throw new NotFoundException(NavbarErrorKeyEnum.ITEM_NOT_FOUND);
      return { success: true, message: 'Item deleted.' };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new InternalServerErrorException(
        NavbarErrorKeyEnum.FAILED_TO_DELETE_ITEM,
        { cause: err },
      );
    }
  }

  /**
   * PUT /v1/navbar/items/reorder
   *
   * Bulk updates sort_order for a list of item IDs.
   * Uses individual UPDATE statements inside a Promise.all for clarity.
   * For large menus a single CASE WHEN expression would be faster; at the
   * scale of a navbar (< 20 items) this is fine.
   */
  async reorderNavItems(domain: string, dto: ReorderNavItemsDto) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const menuRow = await this.findMenuRow(companyId);
      if (!menuRow)
        throw new NotFoundException(NavbarErrorKeyEnum.MENU_NOT_FOUND);

      const ids = dto.items.map((i) => i.id);

      // Verify all IDs belong to this menu (security guard)
      const owned = await this.db
        .select({ id: nav_items.id })
        .from(nav_items)
        .where(
          and(eq(nav_items.menu_id, menuRow.id), inArray(nav_items.id, ids)),
        )
        .catch((err) => {
          throw new InternalServerErrorException(
            NavbarErrorKeyEnum.FAILED_TO_REORDER_ITEMS,
            { cause: err },
          );
        });

      if (owned.length !== ids.length) {
        throw new BadRequestException(NavbarErrorKeyEnum.ITEM_MENU_MISMATCH);
      }

      await Promise.all(
        dto.items.map(({ id, sort_order }) =>
          this.db
            .update(nav_items)
            .set({ sort_order, updated_at: new Date() })
            .where(eq(nav_items.id, id)),
        ),
      ).catch((err) => {
        throw new InternalServerErrorException(
          NavbarErrorKeyEnum.FAILED_TO_REORDER_ITEMS,
          { cause: err },
        );
      });

      return { success: true, message: `Reordered ${ids.length} items.` };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new InternalServerErrorException(
        NavbarErrorKeyEnum.FAILED_TO_REORDER_ITEMS,
        { cause: err },
      );
    }
  }
}
