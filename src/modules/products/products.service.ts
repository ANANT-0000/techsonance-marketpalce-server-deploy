import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module.js';
import { CreateProductDto } from './dto/createProduct.dto.js';
import {
  categories,
  product_images,
  product_variants,
  products,
  product_categories,
} from '../../drizzle/schema/shop.schema.js';
import {
  ProductImageType,
  ProductStatus,
  PlatformFilterName,
} from '../../drizzle/types/types.js';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  like,
  lte,
  or,
  SQL,
  sql,
} from 'drizzle-orm';

import { UploadToCloudService } from '../../utils/upload-to-cloud/upload-to-cloud.service.js';
import { UpdateProductDto } from './dto/updatedProduct.dto.js';
import { type ProductFiles } from '../../common/Types/index.type.js';
import { CompanyService } from '../company/company.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import {
  inventory,
  nav_menus,
  product_filters,
  product_tax,
  vendor_nav_links,
  warehouse,
} from '../../drizzle/schema/index.js';
import { domainExtractor } from '../../common/filters/domainExtractor.filter.js';
import { GetProductsQueryDto, SortBy } from './dto/get-products-query.dto.js';
import {
  GetDynamicProductsDto,
  Highlights,
  PriceCollation,
  Timeframe,
} from './dto/get-dynamic-products.dto.js';
import { extractCloudinaryPublicId } from '../../common/filters/extractCloudinaryPublicId.filter.js';
import { ProductsErrorKeyEnum } from './constants/products.enums.js';
import { UsageTrackerService } from '../entitlements/usage-tracker.service.js';
import { PricingService } from '../pricing/pricing.service.js';
import { FilterEvaluatorService } from './filter-evaluator.service.js';

@Injectable()
export class ProductsService {
  constructor(
    @Inject(DRIZZLE) readonly db: DrizzleService,
    @Inject(UploadToCloudService)
    private uploadToCloudService: UploadToCloudService,
    private inventoryService: InventoryService,
    private readonly companyService: CompanyService,
    private usageTracker: UsageTrackerService,
    private pricingService: PricingService,
    private filterEvaluatorService: FilterEvaluatorService,
  ) {}
  private async resolveCompanyId(domain: string): Promise<string> {
    const filterDomain = domainExtractor(domain);
    return this.companyService.find(filterDomain);
  }
  private async getCategoryAndDescendantIds(
    companyId: string,
    categoryIdentifier: string,
  ): Promise<string[]> {
    const dbCategories = await this.db
      .select({
        id: categories.id,
        parent_id: categories.parent_id,
        slug: categories.slug,
        name: categories.name,
      })
      .from(categories)
      .where(eq(categories.company_id, companyId))
      .catch((error) => {
        throw new InternalServerErrorException(
          ProductsErrorKeyEnum.FAILED_TO_FETCH_CATEGORY,
          { cause: error },
        );
      });

    if (dbCategories.length === 0) return [];

    const isUuid =
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
        categoryIdentifier,
      );
    const target = dbCategories.find((c) =>
      isUuid
        ? c.id === categoryIdentifier
        : c.slug === categoryIdentifier || c.name === categoryIdentifier,
    );

    if (!target) return [];

    const childrenMap = new Map<string, string[]>();
    dbCategories.forEach((c) => {
      if (c.parent_id) {
        const children = childrenMap.get(c.parent_id) || [];
        children.push(c.id);
        childrenMap.set(c.parent_id, children);
      }
    });

    const resultIds: string[] = [target.id];
    const queue = [target.id];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const children = childrenMap.get(currentId) || [];
      for (const childId of children) {
        if (!resultIds.includes(childId)) {
          resultIds.push(childId);
          queue.push(childId);
        }
      }
    }

    return resultIds;
  }
  async getVendorProducts(domain: string, query: GetProductsQueryDto = {}) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const {
        offset = 0,
        limit = 10,
        search,
        category,
        status,
        min_price,
        max_price,
        sort_by = SortBy.NEWEST,
      } = query;

      // ── Build WHERE conditions ──────────────────────────────────────────────
      const conditions: SQL[] = [eq(products.company_id, companyId)];

      if (
        status &&
        status.trim() !== '' &&
        status !== 'all' &&
        status !== 'null' &&
        status !== 'undefined'
      ) {
        conditions.push(eq(products.status, status as any));
      }

      if (
        search &&
        search.trim() !== '' &&
        search !== 'null' &&
        search !== 'undefined'
      ) {
        const term: string = `%${search.trim()}%`;
        const matchingVariants = await this.db
          .select({ product_id: product_variants.product_id })
          .from(product_variants)
          .where(ilike(product_variants.sku, term))
          .catch((error) => {
            throw new InternalServerErrorException(
              ProductsErrorKeyEnum.FAILED_TO_FETCH_PRODUCTS,
              { cause: error },
            );
          });
        const matchingProductIds = matchingVariants
          .map((v) => v.product_id)
          .filter((id): id is string => !!id);

        const searchConditions = [
          ilike(products.name, term),
          ilike(products.description, term),
        ];

        if (matchingProductIds.length > 0) {
          searchConditions.push(inArray(products.id, matchingProductIds));
        }

        const searchCondition = or(...searchConditions);
        if (searchCondition) {
          conditions.push(searchCondition);
        }
      }

      if (
        category &&
        category.trim() !== '' &&
        category !== 'null' &&
        category !== 'undefined'
      ) {
        const targetCategoryIds = await this.getCategoryAndDescendantIds(
          companyId,
          category,
        );
        if (targetCategoryIds.length > 0) {
          conditions.push(
            inArray(
              products.id,
              this.db
                .select({ product_id: product_categories.product_id })
                .from(product_categories)
                .where(
                  inArray(product_categories.category_id, targetCategoryIds),
                ),
            ),
          );
        } else {
          // If category is selected but not found, we ensure the query matches nothing
          conditions.push(sql`1 = 0`);
        }
      }

      if (min_price !== undefined && min_price > 0) {
        conditions.push(
          gte(sql`CAST(${products.base_price} AS NUMERIC)`, min_price),
        );
      }

      if (max_price !== undefined && max_price > 0) {
        conditions.push(
          lte(sql`CAST(${products.base_price} AS NUMERIC)`, max_price),
        );
      }

      const whereCause = and(...conditions);

      // ── Sorting ─────────────────────────────────────────────────────────────
      // const orderBy = (() => {
      //   switch (sort_by) {
      //     case SortBy.PRICE_ASC:
      //       return asc(sql`CAST(${products.base_price} AS NUMERIC)`);
      //     case SortBy.PRICE_DESC:
      //       return desc(sql`CAST(${products.base_price} AS NUMERIC)`);
      //     case SortBy.NAME_ASC:
      //       return asc(products.name);
      //     case SortBy.DISCOUNT:
      //       return desc(sql`CAST(${products.discount_percent} AS NUMERIC)`);
      //     case SortBy.NEWEST:
      //     default:
      //       return desc(products.created_at);
      //   }
      // })();

      // ── Total count (for pagination) ─────────────────────────────────────────
      const [{ total }] = await this.db
        .select({ total: count() })
        .from(products)
        .where(whereCause)
        .catch((error) => {
          throw new InternalServerErrorException(
            ProductsErrorKeyEnum.FAILED_TO_COUNT_PRODUCTS,
            {
              cause: error,
            },
          );
        });

      // ── Hydrate with relations ───────────────────────────────────────────────
      const productList = await this.db.query.products
        .findMany({
          where: whereCause,
          limit: limit,
          offset: offset,
          with: {
            productCategories: {
              columns: { is_primary: true },
              with: {
                category: true,
              },
            },
            variants: {
              columns: {
                id: true,
                variant_name: true,
                price: true,
                sku: true,
                status: true,
                product_id: true,
              },
              with: {
                images: {
                  limit: 1,
                  where: (images) => eq(images.is_primary, true),
                },
                inventory: {
                  columns: { stock_quantity: true, warehouse_id: true },
                },
              },
            },
          },
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            ProductsErrorKeyEnum.FAILED_TO_FETCH_PRODUCTS,
            {
              cause: error,
            },
          );
        });
      return {
        data: productList.map((p) => this.resolveProductPricing(p)),
        total: Number(total),
        offset,
        limit,
        totalPages: Math.ceil(Number(total) / limit),
      };
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        ProductsErrorKeyEnum.FAILED_TO_FETCH_PRODUCTS,
        {
          cause: error,
        },
      );
    }
  }
  async getAllProducts(domain: string, query: GetProductsQueryDto = {}) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const {
        offset = 0,
        limit = 10,
        search,
        category,
        min_price,
        max_price,
        sort_by = SortBy.NEWEST,
      } = query;

      // ── Build WHERE conditions ──────────────────────────────────────────────
      const conditions: SQL[] = [eq(products.company_id, companyId)];

      if (
        search &&
        search.trim() !== '' &&
        search !== 'null' &&
        search !== 'undefined'
      ) {
        const term: string = `%${search.trim()}%`;
        const matchingVariants = await this.db
          .select({ product_id: product_variants.product_id })
          .from(product_variants)
          .where(ilike(product_variants.sku, term));
        const matchingProductIds = matchingVariants
          .map((v) => v.product_id)
          .filter((id): id is string => !!id);

        const searchConditions = [
          ilike(products.name, term),
          ilike(products.description, term),
        ];

        if (matchingProductIds.length > 0) {
          searchConditions.push(inArray(products.id, matchingProductIds));
        }

        const searchCondition = or(...searchConditions);
        if (searchCondition) {
          conditions.push(searchCondition);
        }
      }

      if (
        category &&
        category.trim() !== '' &&
        category !== 'null' &&
        category !== 'undefined'
      ) {
        const targetCategoryIds = await this.getCategoryAndDescendantIds(
          companyId,
          category,
        );
        if (targetCategoryIds.length > 0) {
          conditions.push(
            inArray(
              products.id,
              this.db
                .select({ product_id: product_categories.product_id })
                .from(product_categories)
                .where(
                  inArray(product_categories.category_id, targetCategoryIds),
                ),
            ),
          );
        } else {
          // If category is selected but not found, we ensure the query matches nothing
          conditions.push(sql`1 = 0`);
        }
      }

      if (min_price !== undefined && min_price > 0) {
        conditions.push(
          gte(sql`CAST(${products.base_price} AS NUMERIC)`, min_price),
        );
      }

      if (max_price !== undefined && max_price > 0) {
        conditions.push(
          lte(sql`CAST(${products.base_price} AS NUMERIC)`, max_price),
        );
      }

      const whereCause = and(
        ...conditions,
        eq(products.status, ProductStatus.ACTIVE),
      );

      // ── Sorting ─────────────────────────────────────────────────────────────
      // const orderBy = (() => {
      //   switch (sort_by) {
      //     case SortBy.PRICE_ASC:
      //       return asc(sql`CAST(${products.base_price} AS NUMERIC)`);
      //     case SortBy.PRICE_DESC:
      //       return desc(sql`CAST(${products.base_price} AS NUMERIC)`);
      //     case SortBy.NAME_ASC:
      //       return asc(products.name);
      //     case SortBy.DISCOUNT:
      //       return desc(sql`CAST(${products.discount_percent} AS NUMERIC)`);
      //     case SortBy.NEWEST:
      //     default:
      //       return desc(products.created_at);
      //   }
      // })();

      // ── Total count (for pagination) ─────────────────────────────────────────
      const [{ total }] = await this.db
        .select({ total: count() })
        .from(products)
        .where(whereCause)
        .catch((error) => {
          throw new InternalServerErrorException(
            ProductsErrorKeyEnum.FAILED_TO_COUNT_PRODUCTS,
            {
              cause: error,
            },
          );
        });

      // ── Hydrate with relations ───────────────────────────────────────────────
      const productList = await this.db.query.products
        .findMany({
          where: whereCause,
          limit: limit,
          offset: offset,
          with: {
            productCategories: {
              columns: { is_primary: true },
              with: {
                category: true,
              },
            },
            variants: {
              columns: {
                id: true,
                variant_name: true,
                price: true,
                sku: true,
                status: true,
                product_id: true,
              },
              with: {
                images: {
                  limit: 1,
                  where: (images) => eq(images.is_primary, true),
                },
                inventory: {
                  columns: { stock_quantity: true, warehouse_id: true },
                },
              },
            },
          },
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            ProductsErrorKeyEnum.FAILED_TO_FETCH_PRODUCTS,
            {
              cause: error,
            },
          );
        });
      return {
        data: productList.map((p) => this.resolveProductPricing(p)),
        total: Number(total),
        offset,
        limit,
        totalPages: Math.ceil(Number(total) / limit),
      };
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        ProductsErrorKeyEnum.FAILED_TO_FETCH_PRODUCTS,
        {
          cause: error,
        },
      );
    }
  }

  async getDynamicProducts(domain: string, query: GetDynamicProductsDto) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const {
        offset = 0,
        limit = 10,
        search,
        category,
        min_price,
        max_price,
        sort_by = SortBy.NEWEST,
        timeframe,
        highlight,
        price,
        discount,
      } = query;

      // ── Build WHERE conditions ──────────────────────────────────────────────
      const conditions: SQL[] = [
        eq(products.company_id, companyId),
        eq(products.status, ProductStatus.ACTIVE),
      ];

      // search logic
      if (
        search &&
        search.trim() !== '' &&
        search !== 'null' &&
        search !== 'undefined'
      ) {
        const term = `%${search.trim()}%`;
        const matchingVariants = await this.db
          .select({ product_id: product_variants.product_id })
          .from(product_variants)
          .where(ilike(product_variants.sku, term));
        const matchingProductIds = matchingVariants
          .map((v) => v.product_id)
          .filter((id): id is string => !!id);

        const searchConditions = [
          ilike(products.name, term),
          ilike(products.description, term),
        ];

        if (matchingProductIds.length > 0) {
          searchConditions.push(inArray(products.id, matchingProductIds));
        }

        const searchCondition = or(...searchConditions);
        if (searchCondition) {
          conditions.push(searchCondition);
        }
      }

      // category logic
      if (
        category &&
        category.trim() !== '' &&
        category !== 'null' &&
        category !== 'undefined'
      ) {
        const targetCategoryIds = await this.getCategoryAndDescendantIds(
          companyId,
          category,
        );
        if (targetCategoryIds.length > 0) {
          conditions.push(
            inArray(
              products.id,
              this.db
                .select({ product_id: product_categories.product_id })
                .from(product_categories)
                .where(
                  inArray(product_categories.category_id, targetCategoryIds),
                ),
            ),
          );
        } else {
          conditions.push(sql`1 = 0`);
        }
      }

      // Base Price Logic
      if (min_price !== undefined && min_price > 0) {
        conditions.push(
          gte(sql`CAST(${products.base_price} AS NUMERIC)`, min_price),
        );
      }

      if (max_price !== undefined && max_price > 0) {
        conditions.push(
          lte(sql`CAST(${products.base_price} AS NUMERIC)`, max_price),
        );
      }

      // ── Highlight filter ─────────────────────────────────────────────────────
      // Each highlight type adds its own WHERE conditions AND a custom ORDER BY.
      // The flag prevents the timeframe block below from double-constraining dates
      // when the highlight already narrows the `created_at` window.
      let highlightHandlesTimeframe = false;

      if (highlight) {
        // Reusable fragment: product currently has a lower sale price vs. original.
        const hasActiveSaleSql = sql`(
          ${products.compare_at_price} IS NOT NULL
          AND CAST(${products.compare_at_price} AS NUMERIC) > 0
          AND CAST(${products.compare_at_price} AS NUMERIC) > CAST(${products.base_price} AS NUMERIC)
        )`;

        switch (highlight) {
          case Highlights.TRENDING: {
            // Recent (30 days) products that are currently on sale — most promoted first.
            conditions.push(
              sql`${products.created_at} >= NOW() - INTERVAL '30 days'`,
              hasActiveSaleSql,
            );
            highlightHandlesTimeframe = true;
            break;
          }
          case Highlights.NEW_ARRIVALS: {
            // Added within the last 14 days, sorted newest first.
            conditions.push(
              sql`${products.created_at} >= NOW() - INTERVAL '14 days'`,
            );
            highlightHandlesTimeframe = true;
            break;
          }
          case Highlights.BESTSELLER: {
            // Proxy: products with an active compare_at_price — vendor is promoting them.
            // Sorted by highest absolute savings amount so best deals surface first.
            conditions.push(hasActiveSaleSql);
            break;
          }
          case Highlights.FEATURED: {
            // No extra filter — vendor manages featured status externally.
            break;
          }
        }
      }

      // ── Timeframe filter ─────────────────────────────────────────────────────
      // Skipped when the active highlight already applied a date constraint.
      if (timeframe && !highlightHandlesTimeframe) {
        const TIMEFRAME_DAYS: Record<Timeframe, number> = {
          [Timeframe.LAST_7_DAYS]: 7,
          [Timeframe.LAST_14_DAYS]: 14,
          [Timeframe.LAST_30_DAYS]: 30,
          [Timeframe.LAST_90_DAYS]: 90,
        };
        const days = TIMEFRAME_DAYS[timeframe];
        if (days > 0) {
          conditions.push(
            sql`${products.created_at} >= NOW() - INTERVAL '${sql.raw(String(days))} days'`,
          );
        }
      }

      // ── Discount filter ──────────────────────────────────────────────────────
      if (discount !== undefined && discount > 0) {
        conditions.push(
          sql`(
            ${products.compare_at_price} IS NOT NULL
            AND CAST(${products.compare_at_price} AS NUMERIC) > 0
            AND (
              (CAST(${products.compare_at_price} AS NUMERIC) - CAST(${products.base_price} AS NUMERIC))
              / CAST(${products.compare_at_price} AS NUMERIC)
              * 100
            ) >= ${discount}
          )`,
        );
      }

      // ── Price collation filter ───────────────────────────────────────────────
      if (price) {
        const PRICE_CONDITIONS: Record<PriceCollation, SQL> = {
          [PriceCollation.UNDER_500]: sql`CAST(${products.base_price} AS NUMERIC) < 500`,
          [PriceCollation.UNDER_1000]: sql`CAST(${products.base_price} AS NUMERIC) < 1000`,
          [PriceCollation.FROM_1000_TO_5000]: sql`CAST(${products.base_price} AS NUMERIC) BETWEEN 1000 AND 5000`,
          [PriceCollation.PREMIUM]: sql`CAST(${products.base_price} AS NUMERIC) > 5000`,
        };
        conditions.push(PRICE_CONDITIONS[price]);
      }

      const whereClause = and(...conditions);

      // ── Total count (for pagination) ─────────────────────────────────────────
      const [{ total }] = await this.db
        .select({ total: count() })
        .from(products)
        .where(whereClause)
        .catch((error) => {
          throw new InternalServerErrorException(
            ProductsErrorKeyEnum.FAILED_TO_COUNT_PRODUCTS,
            { cause: error },
          );
        });

      // ── Sorting ──────────────────────────────────────────────────────────────
      // When a `highlight` is active it overrides `sort_by` to guarantee semantically
      // consistent results — the vendor picks a label, the system handles the ordering.
      let orderByClause: SQL = desc(products.created_at);

      if (highlight) {
        switch (highlight) {
          case Highlights.TRENDING:
            // Highest discount percentage first — most aggressively promoted items
            orderByClause = desc(
              sql`(
                (CAST(${products.compare_at_price} AS NUMERIC) - CAST(${products.base_price} AS NUMERIC))
                / CAST(${products.compare_at_price} AS NUMERIC)
                * 100
              )`,
            );
            break;
          case Highlights.NEW_ARRIVALS:
            orderByClause = desc(products.created_at);
            break;
          case Highlights.BESTSELLER:
            // Highest absolute savings first — most attractive deal for the customer
            orderByClause = desc(
              sql`(CAST(${products.compare_at_price} AS NUMERIC) - CAST(${products.base_price} AS NUMERIC))`,
            );
            break;
          case Highlights.FEATURED:
            orderByClause = desc(products.created_at);
            break;
        }
      } else {
        switch (sort_by) {
          case SortBy.PRICE_ASC:
            orderByClause = asc(sql`CAST(${products.base_price} AS NUMERIC)`);
            break;
          case SortBy.PRICE_DESC:
            orderByClause = desc(sql`CAST(${products.base_price} AS NUMERIC)`);
            break;
          case SortBy.NAME_ASC:
            orderByClause = asc(products.name);
            break;
          case SortBy.DISCOUNT:
            orderByClause = desc(
              sql`CASE
                WHEN CAST(${products.compare_at_price} AS NUMERIC) > 0
                THEN (CAST(${products.compare_at_price} AS NUMERIC) - CAST(${products.base_price} AS NUMERIC))
                     / CAST(${products.compare_at_price} AS NUMERIC)
                ELSE 0
              END`,
            );
            break;
          case SortBy.NEWEST:
          default:
            orderByClause = desc(products.created_at);
            break;
        }
      }

      // ── Hydrate with relations ───────────────────────────────────────────────
      const productList = await this.db.query.products
        .findMany({
          where: whereClause,
          limit: limit,
          offset: offset,
          orderBy: orderByClause,
          with: {
            productCategories: {
              columns: { is_primary: true },
              with: {
                category: true,
              },
            },
            variants: {
              columns: {
                id: true,
                variant_name: true,
                price: true,
                sku: true,
                status: true,
                product_id: true,
              },
              with: {
                images: {
                  limit: 1,
                  where: (images) => eq(images.is_primary, true),
                },
                inventory: {
                  columns: { stock_quantity: true, warehouse_id: true },
                },
              },
            },
          },
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            ProductsErrorKeyEnum.FAILED_TO_FETCH_PRODUCTS,
            { cause: error },
          );
        });

      return {
        products: productList.map((p) => this.resolveProductPricing(p)),
        total: Number(total),
        offset,
        limit,
        totalPages: Math.ceil(Number(total) / limit),
      };
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        ProductsErrorKeyEnum.FAILED_TO_FETCH_PRODUCTS,
        { cause: error },
      );
    }
  }
  async getProductSuggestions(domain: string, search: string) {
    if (!search || search.trim().length < 2) return { data: [] };
    try {
      const companyId = await this.resolveCompanyId(domain);
      const term = `%${search.trim()}%`;
      const suggestions = await this.db
        .select({ id: products.id, name: products.name })
        .from(products)
        .leftJoin(
          product_variants,
          eq(products.id, product_variants.product_id),
        )
        .where(
          and(
            eq(products.company_id, companyId),
            or(
              ilike(products.name, term),
              ilike(products.description, term),
              ilike(product_variants.sku, term),
            ) as any,
          ),
        )
        .groupBy(products.id, products.name)
        .limit(8)
        .orderBy(asc(products.name))
        .catch((error) => {
          throw new InternalServerErrorException(
            ProductsErrorKeyEnum.FAILED_TO_FETCH_SUGGESTIONS,
            { cause: error },
          );
        });
      return { data: suggestions };
    } catch (error) {
      throw new InternalServerErrorException(
        ProductsErrorKeyEnum.FAILED_TO_FETCH_SUGGESTIONS,
      );
    }
  }

  async getAllProductOptions(domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const productOptions = await this.db
        .select({ id: products.id, name: products.name })
        .from(products)
        .where(eq(products.company_id, companyId))
        .catch((error) => {
          throw new InternalServerErrorException(
            ProductsErrorKeyEnum.FAILED_TO_FETCH_PRODUCTS,
            { cause: error },
          );
        });
      return productOptions;
    } catch (error) {
      throw new InternalServerErrorException(
        ProductsErrorKeyEnum.FAILED_TO_FETCH_PRODUCTS,
        {
          cause: error,
        },
      );
    }
  }
  async getProductMainDetails(productId: string, domain: string) {
    try {
      const productRecord = await this.db.query.products
        .findFirst({
          where: (products) => eq(products.id, productId),
          columns: {
            id: true,
            name: true,
          },
          with: {
            productCategories: {
              columns: { is_primary: true },
              with: {
                category: {
                  columns: {
                    name: true,
                  },
                },
              },
            },
          },
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            ProductsErrorKeyEnum.FAILED_TO_FETCH_PRODUCT,
            {
              cause: error,
            },
          );
        });
      if (!productRecord) {
        throw new HttpException(
          ProductsErrorKeyEnum.PRODUCT_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }
      const { productCategories, ...rest } = productRecord;
      return {
        ...rest,
        categories: productCategories
          ? (productCategories as any[]).map((pc) => ({
              ...(pc.category || {}),
              is_primary: pc.is_primary,
            }))
          : [],
      };
    } catch (error) {
      throw new InternalServerErrorException(
        ProductsErrorKeyEnum.FAILED_TO_FETCH_PRODUCT,
        {
          cause: error,
        },
      );
    }
  }

  async getProductById(productId: string, domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);

      let condition: SQL[];

      if (productId) {
        condition = [eq(products.id, productId)];
      } else {
        // Try matching by SKU first
        const variantRecords = await this.db
          .select({ product_id: product_variants.product_id })
          .from(product_variants)
          .where(eq(product_variants.sku, productId))
          .limit(1)
          .catch((error) => {
            throw new InternalServerErrorException(
              ProductsErrorKeyEnum.FAILED_TO_FETCH_PRODUCT,
              { cause: error },
            );
          });

        if (variantRecords.length > 0 && variantRecords[0].product_id) {
          condition = [eq(products.id, variantRecords[0].product_id)];
        } else {
          // If not found by SKU, try matching by name or URL-decoded name
          const nameCondition = or(
            eq(products.name, productId),
            ilike(products.name, productId),
            eq(products.name, decodeURIComponent(productId)),
            ilike(products.name, decodeURIComponent(productId)),
          );
          condition = nameCondition ? [nameCondition] : [];
        }
      }

      const productRecord = await this.db.query.products
        .findFirst({
          where: and(eq(products.company_id, companyId), ...condition),
          with: {
            variants: {
              where: eq(product_variants.status, ProductStatus.ACTIVE),
              with: {
                images: true,
                inventory: {
                  with: {
                    warehouse: true,
                  },
                },
              },
            },
            productCategories: {
              columns: { is_primary: true },
              with: {
                category: true,
              },
            },
          },
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            ProductsErrorKeyEnum.FAILED_TO_FETCH_PRODUCT,
            {
              cause: error,
            },
          );
        });

      if (!productRecord) {
        throw new HttpException(
          ProductsErrorKeyEnum.PRODUCT_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }
      return this.resolveProductPricing(productRecord);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        ProductsErrorKeyEnum.FAILED_TO_FETCH_PRODUCT,
        {
          cause: error,
        },
      );
    }
  }
  async getProductDetailsById(productVariantId: string, domain: string) {
    try {
      let resolvedVariantId = productVariantId;
      const isProductVariantExist = await this.db
        .select({ id: product_variants.id })
        .from(product_variants)
        .where(eq(product_variants.id, productVariantId))
        .catch((error) => {
          throw new InternalServerErrorException(
            ProductsErrorKeyEnum.FAILED_TO_CHECK_PRODUCT_VARIANT_EXISTENCE,
            { cause: error },
          );
        });

      if (isProductVariantExist.length === 0) {
        const fallbackVariants = await this.db
          .select({ id: product_variants.id })
          .from(product_variants)
          .where(eq(product_variants.product_id, productVariantId))
          .limit(1)
          .catch((error) => {
            throw new InternalServerErrorException(
              ProductsErrorKeyEnum.FAILED_TO_FETCH_PRODUCT,
              { cause: error },
            );
          });
        if (fallbackVariants.length > 0) {
          resolvedVariantId = fallbackVariants[0].id;
        }
      }

      const productVariant = await this.db.query.product_variants
        .findFirst({
          where: eq(product_variants.id, resolvedVariantId),
          with: {
            images: {
              orderBy: (images, { asc }) => [asc(images.display_order)],
            },
            product: {
              columns: {
                id: true,
                name: true,
                description: true,
                features: true,
                base_price: true,
                compare_at_price: true,
                status: true,
                sale_starts_at: true,
                sale_ends_at: true,
                created_at: true,
                updated_at: true,
                company_id: true,
                vendor_id: true,
              },
              with: {
                productCategories: {
                  columns: { is_primary: true },
                  with: {
                    category: true,
                  },
                },
              },
            },
            inventory: {
              columns: {
                stock_quantity: true,
                warehouse_id: true,
              },
              with: {
                warehouse: {
                  columns: {
                    id: true,
                    warehouse_name: true,
                  },
                },
              },
            },
          },
        })
        .then(async (res) => {
          if (!res) return res;

          if (res.product_id) {
            const taxMapping = await this.db
              .select({ tax_slab_id: product_tax.tax_slab_id })
              .from(product_tax)
              .where(eq(product_tax.product_id, res.product_id))
              .limit(1)
              .catch((error) => {
                throw new InternalServerErrorException(
                  ProductsErrorKeyEnum.FAILED_TO_FETCH_PRODUCT,
                  { cause: error },
                );
              });
            if (res.product) {
              const { productCategories, ...restProduct } = res.product as any;
              (res as any).product = {
                ...restProduct,
                stock_quantity: res.inventory?.stock_quantity || 0,
                categories: productCategories
                  ? (productCategories as any[]).map((pc) => ({
                      ...(pc.category || {}),
                      is_primary: pc.is_primary,
                    }))
                  : [],
                tax_slab_id: taxMapping[0]?.tax_slab_id || '',
              };
            }
          }

          // Map to match frontend VendorUpdateVariantPayload
          return {
            ...res,
            stock_quantity: res.inventory?.stock_quantity || 0,
            warehouse_id: res.inventory?.warehouse_id || '',
            seo_meta: null,
          };
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            ProductsErrorKeyEnum.FAILED_TO_FETCH_PRODUCT,
            {
              cause: error,
            },
          );
        });
      if (!productVariant) {
        throw new HttpException(
          ProductsErrorKeyEnum.PRODUCT_VARIANT_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }

      return productVariant;
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        ProductsErrorKeyEnum.FAILED_TO_FETCH_PRODUCT,
        {
          cause: error,
        },
      );
    }
  }
  async getActiveProducts(
    domain: string,
    filters?: {
      search: string;
      limit: number;
      offset: number;
      status: string | undefined;
      date: string;
      sortby: string;
    },
  ) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const result = await this.db.query.products
        .findMany({
          where: and(eq(products.company_id, companyId)),
          columns: {
            id: true,
            created_at: true,
          },
          limit: filters?.limit ?? 10,
          offset: filters?.offset ?? 0,
          with: {
            variants: {
              where: eq(product_variants.status, ProductStatus.ACTIVE),
              columns: {
                id: true,
                status: true,
              },
            },
          },
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            ProductsErrorKeyEnum.FAILED_TO_FETCH_ACTIVE_PRODUCTS,
            { cause: error },
          );
        });
      const response = result.map((product) => product.variants).flat();
      return response;
    } catch (error) {
      throw new InternalServerErrorException(
        ProductsErrorKeyEnum.FAILED_TO_FETCH_ACTIVE_PRODUCTS,
        {
          cause: error,
        },
      );
    }
  }

  async getHomepageProducts(domain: string, limit: number = 8) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const productList = await this.db.query.products.findMany({
        where: and(
          eq(products.company_id, companyId),
          eq(products.status, ProductStatus.ACTIVE),
        ),
        limit,
        orderBy: (products, { desc }) => [desc(products.created_at)],
        with: {
          productCategories: {
            where: eq(product_categories.is_primary, true),
            with: { category: { columns: { name: true } } },
          },
          variants: {
            limit: 1,
            columns: {
              id: true,
              variant_name: true,
              price: true,
              sku: true,
              status: true,
              product_id: true,
            },
            with: {
              images: {
                limit: 1,
                where: (images) => eq(images.is_primary, true),
                columns: { image_url: true },
              },
              inventory: {
                columns: { stock_quantity: true, warehouse_id: true },
              },
            },
          },
        },
      });
      return productList;
    } catch (error) {
      throw new InternalServerErrorException(
        ProductsErrorKeyEnum.FAILED_TO_FETCH_HOMEPAGE_PRODUCTS,
        { cause: error },
      );
    }
  }
  async createProduct(
    productDto: CreateProductDto,
    vendorId: string,
    domain: string,
  ) {
    const finalResults: {
      url: string;
      type: ProductImageType;
      resource_type: string;
    }[] = [];

    if (productDto.product_media && productDto.product_media.length > 0) {
      finalResults.push({
        url: productDto.product_media[0],
        type: ProductImageType.MAIN,
        resource_type: 'image',
      });
    }

    if (productDto.feature_media && productDto.feature_media.length > 0) {
      finalResults.push(
        ...productDto.feature_media.map((url) => ({
          url,
          type: ProductImageType.GALLERY,
          resource_type: 'image',
        })),
      );
    }

    try {
      const companyId = await this.resolveCompanyId(domain);
      return await this.db.transaction(async (tx) => {
        const primaryCatId =
          productDto.primary_category_id || productDto.category_ids?.[0];
        const allCategoryIds = Array.from(
          new Set([
            ...(productDto.category_ids || []),
            ...(primaryCatId ? [primaryCatId] : []),
          ]),
        );

        if (primaryCatId) {
          const categoryRecord = await tx
            .select({ id: categories.id })
            .from(categories)
            .where(eq(categories.id, primaryCatId))
            .catch((error) => {
              throw new InternalServerErrorException(
                ProductsErrorKeyEnum.FAILED_TO_FETCH_CATEGORY,
                { cause: error },
              );
            });
          if (categoryRecord.length === 0) {
            throw new Error('Category not found');
          }
        }
        const productInsert = {
          name: productDto.name,
          description: productDto.description,
          base_price: productDto.base_price?.toString(),
          compare_at_price: productDto.compare_at_price
            ? productDto.compare_at_price?.toString()
            : null,
          sale_starts_at: productDto.sale_starts_at
            ? new Date(productDto.sale_starts_at)
            : null,
          sale_ends_at: productDto.sale_ends_at
            ? new Date(productDto.sale_ends_at)
            : null,
          status: productDto.status,
          features: productDto.features,
          vendor_id: vendorId,
          company_id: companyId,
        };
        const [createdProduct] = await tx
          .insert(products)
          .values(productInsert)
          .returning({ id: products.id })
          .catch((error) => {
            throw new InternalServerErrorException(
              ProductsErrorKeyEnum.FAILED_TO_UPDATE_PRODUCT,
              { cause: error },
            );
          });

        if (createdProduct?.id && allCategoryIds.length > 0) {
          const values = allCategoryIds.map((cid, idx) => ({
            product_id: createdProduct.id,
            category_id: cid,
            is_primary: cid === primaryCatId,
            sort_order: idx,
          }));

          await tx
            .insert(product_categories)
            .values(values)
            .catch((error) => {
              throw new InternalServerErrorException(
                'Failed to assign product category',
                { cause: error },
              );
            });
        }

        const [variantRecords] = await tx
          .insert(product_variants)
          .values({
            variant_name: productDto.variant_name || productDto.name,
            sku: productDto.sku,
            price:
              productDto.price?.toString() || productDto.base_price?.toString(),
            compare_at_price: productDto.compare_at_price
              ? productDto.compare_at_price.toString()
              : null,
            sale_starts_at: productDto.sale_starts_at
              ? new Date(productDto.sale_starts_at)
              : null,
            sale_ends_at: productDto.sale_ends_at
              ? new Date(productDto.sale_ends_at)
              : null,
            attributes: productDto.attributes,
            status: productDto.status,
            product_id: createdProduct.id,
            weight_kg: productDto.weight_kg,
            length_cm: productDto.length_cm,
            width_cm: productDto.width_cm,
            height_cm: productDto.height_cm,
          })
          .returning({
            id: product_variants.id,
          })
          .catch((error) => {
            throw new InternalServerErrorException(
              ProductsErrorKeyEnum.FAILED_TO_CREATE_PRODUCT_VARIANT,
              {
                cause: error,
              },
            );
          });

        if (variantRecords?.id) {
          await this.pricingService.recordPriceChange(
            tx,
            variantRecords.id,
            null,
            productDto.price.toString() || productDto.base_price.toString(),
            null,
            productDto.compare_at_price
              ? productDto.compare_at_price.toString()
              : null,
          );
        }

        if (finalResults.length > 0) {
          const imageInserts = finalResults.map((image, index) => ({
            variant_id: variantRecords?.id,
            product_id: createdProduct?.id,
            image_url: image.url,
            alt_text: `${image.type} Image ${index + 1}`,
            is_primary: index === 0,
            imgType: image.type,
            display_order: index,
          }));
          const createdImages = await tx
            .insert(product_images)
            .values(imageInserts)
            .returning()
            .catch((error) => {
              throw new InternalServerErrorException(
                ProductsErrorKeyEnum.FAILED_TO_INSERT_PRODUCT_IMAGES,
                { cause: error },
              );
            });
        }
        if (!productDto.warehouse_id && variantRecords?.id) {
          const defaultWarehouse = await tx
            .select()
            .from(warehouse)
            .where(eq(warehouse.company_id, companyId))
            .limit(1)
            .orderBy(desc(warehouse.created_at))
            .catch((error) => {
              throw new InternalServerErrorException(
                ProductsErrorKeyEnum.FAILED_TO_CREATE_PRODUCT_VARIANT,
                { cause: error },
              );
            });
          const inventoryResult = await this.inventoryService.setStock(
            variantRecords.id,
            defaultWarehouse[0].id,
            productDto.stock_quantity ?? 0,
            companyId,
            tx as DrizzleService, // pass transaction context
          );
        }
        if (productDto.warehouse_id && variantRecords?.id) {
          const inventoryResult = await this.inventoryService.setStock(
            variantRecords.id,
            productDto.warehouse_id,
            productDto.stock_quantity ?? 0,
            companyId,
            tx as DrizzleService, // pass transaction context
          );
        }
        await tx
          .insert(product_tax)
          .values({
            product_id: createdProduct.id,
            tax_slab_id: productDto.tax_slab_id,
          })
          .catch((error) => {
            throw new InternalServerErrorException(
              ProductsErrorKeyEnum.FAILED_TO_CREATE_PRODUCT_TAX_MAPPING,
              {
                cause: error,
              },
            );
          });
        await this.usageTracker.increment(companyId, 'max_products', 1);

        return {
          id: variantRecords?.id,
          message: 'Product created successfully',
          status: HttpStatus.CREATED,
        };
      });
    } catch (error) {
      for (const file of finalResults) {
        const publicId = extractCloudinaryPublicId(file.url);
        if (publicId)
          await this.uploadToCloudService.deleteFile(
            publicId,
            file.resource_type,
          );
      }

      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        ProductsErrorKeyEnum.FAILED_TO_REGISTER_VENDOR,
        {
          cause: error,
        },
      );
    }
  }
  async updateProduct(
    domain: string,
    productVariantId: string,
    product: UpdateProductDto,
    imagesToDelete?: string[],
    vendorId?: string,
  ) {
    const imageToDeleteUrl: {
      toDeleteUrl: string | undefined;
      url: string | undefined;
    }[] = [];

    if (!productVariantId) {
      throw new HttpException(
        ProductsErrorKeyEnum.PRODUCT_VARIANT_ID_IS_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    const companyId = await this.resolveCompanyId(domain);
    let resolvedProductId: string | undefined;
    let resolvedVariantId: string | undefined;

    const variantRow = await this.db
      .select({
        product_id: product_variants.product_id,
        id: product_variants.id,
      })
      .from(product_variants)
      .innerJoin(products, eq(product_variants.product_id, products.id))
      .where(
        and(
          eq(product_variants.id, productVariantId),
          eq(products.company_id, companyId),
        ),
      )
      .limit(1)
      .catch((error) => {
        throw new InternalServerErrorException(
          ProductsErrorKeyEnum.FAILED_TO_FETCH_PRODUCT_VARIANT,
          { cause: error },
        );
      });

    if (variantRow.length > 0) {
      resolvedProductId = variantRow[0].product_id ?? undefined;
      resolvedVariantId = variantRow[0].id;
    } else {
      const productRow = await this.db
        .select({ id: products.id })
        .from(products)
        .where(
          and(
            eq(products.id, productVariantId),
            eq(products.company_id, companyId),
            vendorId ? eq(products.vendor_id, vendorId) : sql`TRUE`,
          ),
        )
        .limit(1)
        .catch((error) => {
          throw new InternalServerErrorException(
            ProductsErrorKeyEnum.FAILED_TO_FETCH_PRODUCT,
            { cause: error },
          );
        });

      if (productRow.length > 0) {
        resolvedProductId = productRow[0].id;
        const firstVariant = await this.db
          .select({ id: product_variants.id })
          .from(product_variants)
          .where(eq(product_variants.product_id, resolvedProductId))
          .limit(1)
          .catch((error) => {
            throw new InternalServerErrorException(
              ProductsErrorKeyEnum.FAILED_TO_FETCH_PRODUCT_VARIANT,
              { cause: error },
            );
          });
        if (firstVariant.length > 0) {
          resolvedVariantId = firstVariant[0].id;
        }
      }
    }

    if (!resolvedProductId) {
      throw new HttpException(
        ProductsErrorKeyEnum.PRODUCT_ID_NOT_FOUND_FOR_THE_GIVEN_VARIANT,
        HttpStatus.NOT_FOUND,
      );
    }

    const productUpdatedData = {
      name: product.name,
      description: product.description,
      features: product.features,
      base_price: product.base_price?.toString(),
      compare_at_price:
        product.compare_at_price !== undefined
          ? product.compare_at_price
            ? product.compare_at_price?.toString()
            : null
          : undefined,
      sale_starts_at:
        product.sale_starts_at !== undefined
          ? product.sale_starts_at
            ? new Date(product.sale_starts_at)
            : null
          : undefined,
      sale_ends_at:
        product.sale_ends_at !== undefined
          ? product.sale_ends_at
            ? new Date(product.sale_ends_at)
            : null
          : undefined,
      status: product.status,
    };
    try {
      if (!product) {
        throw new HttpException(
          ProductsErrorKeyEnum.PRODUCT_DATA_NOT_VALID,
          HttpStatus.BAD_REQUEST,
        );
      }
      await this.db
        .transaction(async (tx) => {
          const updatedProductResult = await tx
            .update(products)
            .set(productUpdatedData)
            .where(
              and(
                eq(products.id, resolvedProductId),
                eq(products.company_id, companyId),
                vendorId ? eq(products.vendor_id, vendorId) : sql`TRUE`,
              ),
            )
            .catch((error) => {
              throw new InternalServerErrorException(
                ProductsErrorKeyEnum.FAILED_TO_UPDATE_PRODUCT,
                {
                  cause: error,
                },
              );
            });

          const primaryCatId =
            product.primary_category_id || product.category_ids?.[0];
          const hasCategories =
            Array.isArray(product.category_ids) &&
            product.category_ids.length > 0;

          if (hasCategories && resolvedProductId) {
            const allCategoryIds = Array.from(
              new Set([
                ...(product.category_ids || []),
                ...(primaryCatId ? [primaryCatId] : []),
              ]),
            );

            await tx
              .delete(product_categories)
              .where(eq(product_categories.product_id, resolvedProductId))
              .catch((error) => {
                throw new InternalServerErrorException(
                  'Failed to remove old category mappings',
                  { cause: error },
                );
              });

            if (allCategoryIds.length > 0) {
              const values = allCategoryIds.map((cid, idx) => ({
                product_id: resolvedProductId,
                category_id: cid,
                is_primary: cid === primaryCatId,
                sort_order: idx,
              }));

              await tx
                .insert(product_categories)
                .values(values)
                .catch((error) => {
                  throw new InternalServerErrorException(
                    'Failed to assign product categories',
                    { cause: error },
                  );
                });
            }
          }

          if (product.tax_slab_id) {
            await tx
              .insert(product_tax)
              .values({
                product_id: resolvedProductId,
                tax_slab_id: product.tax_slab_id,
              })
              .onConflictDoUpdate({
                target: product_tax.product_id,
                set: {
                  tax_slab_id: product.tax_slab_id,
                  updated_at: new Date(),
                },
              })
              .catch((error) => {
                throw new InternalServerErrorException(
                  ProductsErrorKeyEnum.FAILED_TO_CREATE_PRODUCT_TAX_MAPPING,
                  {
                    cause: error,
                  },
                );
              });
          }

          const imagesToDeleteIds = imagesToDelete;
          if (imagesToDeleteIds && imagesToDeleteIds.length > 0) {
            const urls = await tx
              .select({ image_url: product_images.image_url })
              .from(product_images)
              .where(inArray(product_images.id, imagesToDeleteIds))
              .then((res) => {
                return res.map((item) => item.image_url);
              })
              .catch((error) => {
                throw new InternalServerErrorException(
                  ProductsErrorKeyEnum.FAILED_TO_FETCH_IMAGE_URLS_FOR_DELETION,
                  {
                    cause: error,
                  },
                );
              });
            if (urls && urls.length > 0) {
              await Promise.all(
                urls.map((url) => {
                  const publicId = extractCloudinaryPublicId(url);
                  if (publicId) {
                    return this.uploadToCloudService
                      .deleteFile(publicId, 'image')
                      .catch(() => {});
                  }
                  return Promise.resolve();
                }),
              );
            }
            await tx
              .delete(product_images)
              .where(inArray(product_images.id, imagesToDeleteIds))
              .catch((error) => {
                throw new InternalServerErrorException(
                  ProductsErrorKeyEnum.FAILED_TO_DELETE_PRODUCT_IMAGE,
                  {
                    cause: error,
                  },
                );
              });
          }

          const finalResults: { url: string; type: ProductImageType }[] = [];

          if (product.product_media && product.product_media.length > 0) {
            finalResults.push({
              url: product.product_media[0],
              type: ProductImageType.MAIN,
            });
          }

          if (product.feature_media && product.feature_media.length > 0) {
            finalResults.push(
              ...product.feature_media.map((url) => ({
                url,
                type: ProductImageType.GALLERY,
              })),
            );
          }

          const targetVariantId = product.variant_id || resolvedVariantId;

          if (finalResults.length > 0 && targetVariantId) {
            const imageInserts = finalResults.map((image, index) => {
              return {
                variant_id: targetVariantId,
                product_id: resolvedProductId,
                image_url: image.url,
                alt_text: `${image.type} Image ${index + 1}`,
                is_primary: image.type === ProductImageType.MAIN,
                imgType: image.type,
                display_order: index,
              };
            });

            const existingImages = await tx
              .select({
                id: product_images.id,
                image_url: product_images.image_url,
              })
              .from(product_images)
              .where(eq(product_images.variant_id, targetVariantId));

            const existingUrls = new Map(
              existingImages.map((img) => [img.image_url, img]),
            );

            const imagesToInsert = [];
            for (const img of imageInserts) {
              const existing = existingUrls.get(img.image_url);
              if (existing) {
                await tx
                  .update(product_images)
                  .set({
                    display_order: img.display_order,
                    is_primary: img.is_primary,
                    imgType: img.imgType,
                  })
                  .where(eq(product_images.id, existing.id));
              } else {
                imagesToInsert.push(img);
              }
            }

            if (imagesToInsert.length > 0) {
              await tx
                .insert(product_images)
                .values(imagesToInsert)
                .catch((error) => {
                  throw new InternalServerErrorException(
                    ProductsErrorKeyEnum.FAILED_TO_INSERT_PRODUCT_IMAGES,
                    {
                      cause: error,
                    },
                  );
                });
            }
          }

          if (targetVariantId) {
            const [existingVariant] = await tx
              .select({
                price: product_variants.price,
                compare_at_price: product_variants.compare_at_price,
              })
              .from(product_variants)
              .where(eq(product_variants.id, targetVariantId))
              .limit(1);

            const updateProductVariantData = {
              variant_name: product.variant_name,
              sku: product.sku,
              price: product.base_price.toString(),
              compare_at_price:
                product.compare_at_price !== undefined
                  ? product.compare_at_price
                    ? product.compare_at_price.toString()
                    : null
                  : undefined,
              sale_starts_at:
                product.sale_starts_at !== undefined
                  ? product.sale_starts_at
                    ? new Date(product.sale_starts_at)
                    : null
                  : undefined,
              sale_ends_at:
                product.sale_ends_at !== undefined
                  ? product.sale_ends_at
                    ? new Date(product.sale_ends_at)
                    : null
                  : undefined,
              attributes: product.attributes,
              status: product.status,
              seo_meta: null,
              weight_kg: product.weight_kg,
              length_cm: product.length_cm,
              width_cm: product.width_cm,
              height_cm: product.height_cm,
            };
            const updatedVariantResult = await tx
              .update(product_variants)
              .set(updateProductVariantData)
              .where(
                and(
                  eq(product_variants.product_id, resolvedProductId),
                  eq(product_variants.id, targetVariantId),
                ),
              )
              .catch((error) => {
                throw new InternalServerErrorException(
                  ProductsErrorKeyEnum.FAILED_TO_UPDATE_PRODUCT_VARIANT,
                  {
                    cause: error,
                  },
                );
              });

            if (
              existingVariant &&
              (updateProductVariantData.price !== undefined ||
                updateProductVariantData.compare_at_price !== undefined)
            ) {
              await this.pricingService.recordPriceChange(
                tx,
                targetVariantId,
                existingVariant.price,
                updateProductVariantData.price
                  ? String(updateProductVariantData.price)
                  : existingVariant.price,
                existingVariant.compare_at_price,
                updateProductVariantData.compare_at_price !== undefined
                  ? updateProductVariantData.compare_at_price
                  : existingVariant.compare_at_price,
              );
            }
          }

          if (product.warehouse_id && targetVariantId) {
            await this.inventoryService.setStock(
              targetVariantId,
              product.warehouse_id,
              product.stock_quantity ?? 0,
              companyId,
              tx as DrizzleService,
            );
          }
          return {
            message: 'Product updated successfully',
            status: HttpStatus.OK,
          };
        })
        .catch((error) => {
          for (const file of imageToDeleteUrl) {
            const publicId = extractCloudinaryPublicId(file.url!);
            if (publicId) {
              this.uploadToCloudService
                .deleteFile(publicId, 'image')
                .then(() => {})
                .catch((err) => {});
            }
          }
          throw new InternalServerErrorException(
            ProductsErrorKeyEnum.FAILED_TO_UPDATE_PRODUCT,
            {
              cause: error,
            },
          );
        });
    } catch (error) {
      throw new InternalServerErrorException(
        ProductsErrorKeyEnum.FAILED_TO_REGISTER_VENDOR,
        {
          cause: error,
        },
      );
    }
  }

  async deleteProduct(
    productId: string,
    vendorId?: string,
    companyId?: string,
  ) {
    if (!productId) {
      throw new HttpException(
        ProductsErrorKeyEnum.PRODUCT_ID_IS_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      const deletedRows = await this.db.transaction(async (tx) => {
        const rows = await tx
          .delete(products)
          .where(
            and(
              eq(products.id, productId),
              vendorId ? eq(products.vendor_id, vendorId) : sql`TRUE`,
            ),
          )
          .returning({ id: products.id });

        if (companyId && rows.length > 0) {
          await this.usageTracker.decrement(
            companyId,
            'max_products',
            rows.length,
            tx,
          );
        }
        return rows;
      });

      return {
        message: 'Product deleted successfully',
        status: HttpStatus.OK,
        deletedCount: deletedRows.length,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        ProductsErrorKeyEnum.FAILED_TO_DELETE_PRODUCT,
        {
          cause: error,
        },
      );
    }
  }
  async UpdateProductCategory(
    categoryId: string,
    productId: string,
    vendorId?: string,
  ) {
    if (!categoryId && !productId) {
      throw new HttpException(
        ProductsErrorKeyEnum.CATEGORY_ID_IS_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      await this.db.transaction(async (tx) => {
        await tx
          .update(product_categories)
          .set({ is_primary: false })
          .where(eq(product_categories.product_id, productId))
          .catch((error) => {
            throw new InternalServerErrorException(
              'Failed to update primary category status',
              { cause: error },
            );
          });

        await tx
          .insert(product_categories)
          .values({
            product_id: productId,
            category_id: categoryId,
            is_primary: true,
            sort_order: 0,
          })
          .onConflictDoUpdate({
            target: [
              product_categories.product_id,
              product_categories.category_id,
            ],
            set: { is_primary: true },
          })
          .catch((error) => {
            throw new InternalServerErrorException(
              'Failed to assign product category',
              { cause: error },
            );
          });
      });
      return {
        message: 'Product category updated successfully',
        status: HttpStatus.OK,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        ProductsErrorKeyEnum.FAILED_TO_UPDATE_PRODUCT_CATEGORY,
        {
          cause: error,
        },
      );
    }
  }

  async deleteSelectedProducts(
    productIds: string[],
    vendorId?: string,
    companyId?: string,
  ) {
    if (!productIds || productIds.length === 0) {
      throw new HttpException(
        ProductsErrorKeyEnum.PRODUCT_IDS_ARE_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      const deletedRows = await this.db.transaction(async (tx) => {
        const rows = await tx
          .delete(products)
          .where(
            and(
              inArray(products.id, productIds),
              vendorId ? eq(products.vendor_id, vendorId) : sql`TRUE`,
            ),
          )
          .returning({ id: products.id })
          .catch((error) => {
            throw new InternalServerErrorException(
              ProductsErrorKeyEnum.FAILED_TO_DELETE_SELECTED_PRODUCTS,
              { cause: error },
            );
          });
        if (companyId && rows.length > 0) {
          await this.usageTracker.decrement(
            companyId,
            'max_products',
            rows.length,
            tx,
          );
        }
        return rows;
      });

      return {
        message: 'Selected products deleted successfully',
        status: HttpStatus.OK,
        deletedCount: deletedRows.length,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        ProductsErrorKeyEnum.FAILED_TO_DELETE_SELECTED_PRODUCTS,
        {
          cause: error,
        },
      );
    }
  }

  async deleteProductVariant(variantId: string, vendorId?: string) {
    if (!variantId) {
      throw new HttpException(
        ProductsErrorKeyEnum.VARIANT_ID_IS_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      await this.db
        .delete(product_variants)
        .where(
          and(
            eq(product_variants.id, variantId),
            vendorId
              ? inArray(
                  product_variants.product_id,
                  this.db
                    .select({ id: products.id })
                    .from(products)
                    .where(eq(products.vendor_id, vendorId)),
                )
              : sql`TRUE`,
          ),
        )
        .catch((error) => {
          throw new InternalServerErrorException(
            ProductsErrorKeyEnum.FAILED_TO_DELETE_PRODUCT_VARIANT,
            { cause: error },
          );
        });
      return {
        message: 'Product variant deleted successfully',
        status: HttpStatus.OK,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        ProductsErrorKeyEnum.FAILED_TO_DELETE_PRODUCT_VARIANT,
        {
          cause: error,
        },
      );
    }
  }
  async deleteSelectedProductVariants(variantIds: string[], vendorId?: string) {
    if (!variantIds || variantIds.length === 0) {
      throw new HttpException(
        ProductsErrorKeyEnum.VARIANT_IDS_ARE_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      await this.db
        .delete(product_variants)
        .where(
          and(
            inArray(product_variants.id, variantIds),
            vendorId
              ? inArray(
                  product_variants.product_id,
                  this.db
                    .select({ id: products.id })
                    .from(products)
                    .where(eq(products.vendor_id, vendorId)),
                )
              : sql`TRUE`,
          ),
        );
      return {
        message: 'Product variant deleted successfully',
        status: HttpStatus.OK,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        ProductsErrorKeyEnum.FAILED_TO_DELETE_PRODUCT_VARIANT,
        {
          cause: error,
        },
      );
    }
  }
  async deleteProductImage(imageId: string) {
    if (!imageId) {
      throw new HttpException(
        ProductsErrorKeyEnum.IMAGE_ID_IS_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      await this.db
        .delete(product_images)
        .where(eq(product_images.id, imageId))
        .catch((error) => {
          throw new InternalServerErrorException(
            ProductsErrorKeyEnum.FAILED_TO_DELETE_PRODUCT_IMAGE,
            { cause: error },
          );
        });
      return {
        message: 'Product image deleted successfully',
        status: HttpStatus.OK,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        ProductsErrorKeyEnum.FAILED_TO_DELETE_PRODUCT_IMAGE,
        {
          cause: error,
        },
      );
    }
  }

  async getRelatedProducts(
    domain: string,
    productId: string,
    limit: number = 8,
  ) {
    try {
      const companyId = await this.resolveCompanyId(domain);

      const currentProduct = await this.db.query.product_categories
        .findFirst({
          where: eq(product_categories.product_id, productId),
          columns: { category_id: true },
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            ProductsErrorKeyEnum.FAILED_TO_FETCH_PRODUCT,
            { cause: error },
          );
        });

      if (!currentProduct || !currentProduct.category_id) {
        return [];
      }

      const relatedProducts = await this.db.query.products
        .findMany({
          where: and(
            eq(products.company_id, companyId),
            inArray(
              products.id,
              this.db
                .select({ product_id: product_categories.product_id })
                .from(product_categories)
                .where(
                  eq(
                    product_categories.category_id,
                    currentProduct.category_id,
                  ),
                ),
            ),
            sql`${products.id} != ${productId}`,
            eq(products.status, ProductStatus.ACTIVE),
          ),
          with: {
            variants: {
              where: eq(product_variants.status, ProductStatus.ACTIVE),
              with: {
                images: true,
                inventory: {
                  with: { warehouse: true },
                },
              },
            },
            productCategories: {
              columns: { is_primary: true },
              with: {
                category: true,
              },
            },
          },
          limit,
          orderBy: [desc(products.created_at)],
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            ProductsErrorKeyEnum.FAILED_TO_FETCH_PRODUCTS,
            { cause: error },
          );
        });

      return relatedProducts.map((p) => this.resolveProductPricing(p));
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      )
        throw error;
      throw new InternalServerErrorException(
        ProductsErrorKeyEnum.FAILED_TO_FETCH_PRODUCTS,
        { cause: error },
      );
    }
  }

  async getRecommendedProducts(
    domain: string,
    productId: string,
    limit: number = 8,
  ) {
    try {
      const companyId = await this.resolveCompanyId(domain);

      const recommendedProducts = await this.db.query.products
        .findMany({
          where: and(
            eq(products.company_id, companyId),
            sql`${products.id} != ${productId}`,
            eq(products.status, ProductStatus.ACTIVE),
          ),
          with: {
            variants: {
              where: eq(product_variants.status, ProductStatus.ACTIVE),
              with: {
                images: true,
                inventory: {
                  with: { warehouse: true },
                },
              },
            },
            productCategories: {
              columns: { is_primary: true },
              with: {
                category: true,
              },
            },
          },
          limit,
          orderBy: [desc(products.created_at)],
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            ProductsErrorKeyEnum.FAILED_TO_FETCH_PRODUCTS,
            { cause: error },
          );
        });

      return recommendedProducts.map((p) => this.resolveProductPricing(p));
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      )
        throw error;
      throw new InternalServerErrorException(
        ProductsErrorKeyEnum.FAILED_TO_FETCH_PRODUCTS,
        { cause: error },
      );
    }
  }

  async getOnSaleProducts(domain: string, limit: number = 8) {
    try {
      const companyId = await this.resolveCompanyId(domain);

      const [dealsFilter] = await this.db
        .select({ rules: product_filters.rules })
        .from(product_filters)
        .where(eq(product_filters.name, PlatformFilterName.DEALS))
        .limit(1)
        .catch(() => []);

      const rulesSql = dealsFilter?.rules
        ? this.filterEvaluatorService.evaluate(dealsFilter.rules as any)
        : undefined;

      const fallbackSql = and(
        sql`${products.compare_at_price} IS NOT NULL AND CAST(${products.compare_at_price} AS NUMERIC) > CAST(${products.base_price} AS NUMERIC)`,
        sql`(${products.sale_starts_at} IS NULL OR ${products.sale_starts_at} <= NOW())`,
        sql`(${products.sale_ends_at} IS NULL OR ${products.sale_ends_at} >= NOW())`,
      );

      const onSaleProducts = await this.db.query.products
        .findMany({
          where: and(
            eq(products.company_id, companyId),
            eq(products.status, ProductStatus.ACTIVE),
            rulesSql || fallbackSql,
          ),
          with: {
            variants: {
              where: eq(product_variants.status, ProductStatus.ACTIVE),
              with: {
                images: true,
                inventory: {
                  with: { warehouse: true },
                },
              },
            },
            productCategories: {
              columns: { is_primary: true },
              with: {
                category: true,
              },
            },
          },
          limit,
          orderBy: [
            desc(
              sql`(CAST(${products.compare_at_price} AS NUMERIC) - CAST(${products.base_price} AS NUMERIC)) / CAST(${products.compare_at_price} AS NUMERIC)`,
            ),
          ],
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            ProductsErrorKeyEnum.FAILED_TO_FETCH_PRODUCTS,
            { cause: error },
          );
        });

      return onSaleProducts.map((p) => this.resolveProductPricing(p));
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      )
        throw error;
      throw new InternalServerErrorException(
        ProductsErrorKeyEnum.FAILED_TO_FETCH_PRODUCTS,
        { cause: error },
      );
    }
  }

  private resolveProductPricing(
    product: Partial<typeof products.$inferSelect> & {
      variants?: Partial<typeof product_variants.$inferSelect>[];
    } & Record<string, unknown>,
  ) {
    if (!product) return product;

    const pricing = this.pricingService.resolveVariantPrice({
      price: product.base_price as string,
      compare_at_price: product.compare_at_price as string | null,
      sale_starts_at: product.sale_starts_at as Date | null,
      sale_ends_at: product.sale_ends_at as Date | null,
    });

    const resolvedProduct = {
      ...product,
      base_price: pricing.price.toString(),
      compare_at_price: pricing.compareAtPrice
        ? pricing.compareAtPrice.toString()
        : null,
      discount_percent: pricing.discountPercent.toString(),
    };

    if (resolvedProduct.variants && Array.isArray(resolvedProduct.variants)) {
      resolvedProduct.variants = resolvedProduct.variants.map(
        (
          variant: Partial<typeof product_variants.$inferSelect> &
            Record<string, unknown>,
        ) => {
          const vPricing = this.pricingService.resolveVariantPrice({
            price: (variant.price || '0') as string,
            compare_at_price: variant.compare_at_price as string | null,
            sale_starts_at: variant.sale_starts_at as Date | null,
            sale_ends_at: variant.sale_ends_at as Date | null,
          });
          return {
            ...variant,
            price: vPricing?.price?.toString() ?? '0',
            compare_at_price: vPricing?.compareAtPrice
              ? vPricing.compareAtPrice.toString()
              : null,
            stock_quantity:
              (variant.inventory as typeof inventory.$inferSelect)
                ?.stock_quantity ?? 0,
            warehouse_id:
              (variant.inventory as typeof inventory.$inferSelect)
                ?.warehouse_id ?? '',
          };
        },
      );
    }

    const productAny = resolvedProduct as any;
    if (
      productAny.productCategories &&
      Array.isArray(productAny.productCategories)
    ) {
      productAny.categories = (productAny.productCategories || []).map(
        (pc: { category: any; is_primary: boolean }) => ({
          ...(pc.category || {}),
          is_primary: pc.is_primary,
        }),
      );
      delete productAny.productCategories;
    } else if (productAny.category) {
      productAny.categories = [{ ...productAny.category, is_primary: true }];
      delete productAny.category;
    }

    return productAny;
  }
  async getCollectionProducts(domain: string, slug: string, limit: number = 8) {
    try {
      const companyId = await this.resolveCompanyId(domain);

      // 1. Fetch vendor_nav_links for this slug
      const [link] = await this.db
        .select({ config: vendor_nav_links.config })
        .from(vendor_nav_links)
        .innerJoin(nav_menus, eq(nav_menus.id, vendor_nav_links.menu_id))
        .where(
          and(
            eq(vendor_nav_links.slug, slug),
            eq(nav_menus.company_id, companyId),
          ),
        )
        .limit(1)
        .catch(() => []);

      if (!link) {
        throw new NotFoundException('Collection not found for this slug');
      }

      const filterId = (link.config as any)?.filter_id;
      if (!filterId) {
        return []; // No filter config
      }

      // 2. Fetch product_filters
      const [filterRow] = await this.db
        .select({ rules: product_filters.rules })
        .from(product_filters)
        .where(eq(product_filters.id, filterId))
        .limit(1)
        .catch(() => []);

      if (!filterRow || !filterRow.rules) {
        return [];
      }

      // 3. Evaluate filter rules to SQL
      const rulesSql = this.filterEvaluatorService.evaluate(
        filterRow.rules as any,
      );

      const conditions = [
        eq(products.company_id, companyId),
        eq(products.status, ProductStatus.ACTIVE),
      ];

      if (rulesSql) {
        conditions.push(rulesSql);
      }

      const collectionProducts = await this.db.query.products
        .findMany({
          where: and(...conditions),
          with: {
            productCategories: {
              columns: { is_primary: true },
              with: {
                category: true,
              },
            },
            variants: {
              columns: {
                id: true,
                variant_name: true,
                price: true,
                sku: true,
                status: true,
                product_id: true,
              },
              with: {
                images: {
                  limit: 1,
                  where: (images) => eq(images.is_primary, true),
                },
                inventory: {
                  columns: { stock_quantity: true, warehouse_id: true },
                },
              },
            },
          },
          limit: limit,
          orderBy: [desc(products.created_at)],
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            ProductsErrorKeyEnum.FAILED_TO_FETCH_PRODUCTS,
            { cause: error },
          );
        });

      return collectionProducts.map((p) => this.resolveProductPricing(p));
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        ProductsErrorKeyEnum.FAILED_TO_FETCH_PRODUCTS,
        { cause: error },
      );
    }
  }
}
