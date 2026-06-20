import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import { CreateProductDto } from './dto/createProduct.dto';
import {
  categories,
  product_images,
  product_variants,
  products,
} from '../../drizzle/schema/shop.schema';
import { productImageType, ProductStatus } from '../../drizzle/types/types';
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

import { UploadToCloudService } from '../../utils/upload-to-cloud/upload-to-cloud.service';
import { UpdateProductDto } from './dto/updatedProduct.dto';
import { type ProductFiles } from '../../common/Types/index.type';
import { CompanyService } from '../company/company.service';
import { InventoryService } from '../inventory/inventory.service';
import { product_tax, warehouse } from '../../drizzle/schema';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { GetProductsQueryDto, SortBy } from './dto/get-products-query.dto';
import { extractCloudinaryPublicId } from '../../common/filters/extractCloudinaryPublicId.filter';
import { ProductsErrorKeyEnum } from './constants/products.enums';

@Injectable()
export class ProductsService {
  constructor(
    @Inject(DRIZZLE) readonly db: DrizzleService,
    @Inject(UploadToCloudService)
    private uploadToCloudService: UploadToCloudService,
    private inventoryService: InventoryService,
    private readonly companyService: CompanyService,
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
      .catch((): any[] => []);

    if (dbCategories.length === 0) return [];

    const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(categoryIdentifier);
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

      if (status && status.trim() !== '' && status !== 'all' && status !== 'null' && status !== 'undefined') {
        conditions.push(eq(products.status, status as any));
      }

      if (search && search.trim() !== '' && search !== 'null' && search !== 'undefined') {
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

      if (category && category.trim() !== '' && category !== 'null' && category !== 'undefined') {
        const targetCategoryIds = await this.getCategoryAndDescendantIds(companyId, category);
        if (targetCategoryIds.length > 0) {
          conditions.push(inArray(products.category_id, targetCategoryIds));
        } else {
          // If category is selected but not found, we ensure the query matches nothing
          conditions.push(eq(products.category_id, '00000000-0000-0000-0000-000000000000'));
        }
      }

      if (min_price !== undefined) {
        conditions.push(gte(products.base_price, String(min_price)));
      }

      if (max_price !== undefined) {
        conditions.push(lte(products.base_price, String(max_price)));
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
            category: true,
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
        data: productList,
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

      if (search && search.trim() !== '' && search !== 'null' && search !== 'undefined') {
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

      if (category && category.trim() !== '' && category !== 'null' && category !== 'undefined') {
        const targetCategoryIds = await this.getCategoryAndDescendantIds(companyId, category);
        if (targetCategoryIds.length > 0) {
          conditions.push(inArray(products.category_id, targetCategoryIds));
        } else {
          // If category is selected but not found, we ensure the query matches nothing
          conditions.push(eq(products.category_id, '00000000-0000-0000-0000-000000000000'));
        }
      }

      if (min_price !== undefined) {
        conditions.push(gte(products.base_price, String(min_price)));
      }

      if (max_price !== undefined) {
        conditions.push(lte(products.base_price, String(max_price)));
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
            category: true,
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
        data: productList,
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
        .orderBy(asc(products.name));
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
        .catch((e) => {
          return [];
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
            category: {
              columns: {
                name: true,
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
      return productRecord;
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
          .limit(1);

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
            category: true,
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
      return productRecord;
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
          );
        });

      if (isProductVariantExist.length === 0) {
        const fallbackVariants = await this.db
          .select({ id: product_variants.id })
          .from(product_variants)
          .where(eq(product_variants.product_id, productVariantId))
          .limit(1)
          .catch(() => []);
        if (fallbackVariants.length > 0) {
          resolvedVariantId = fallbackVariants[0].id;
        }
      }

      const productVariant = await this.db.query.product_variants
        .findFirst({
          where: eq(product_variants.id, resolvedVariantId),
          with: {
            images: true,
            product: {
              columns: {
                id: true,
                name: true,
                description: true,
                features: true,
                base_price: true,
                discount_percent: true,
                status: true,
                category_id: true,
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
          if (res && res.product_id) {
            const taxMapping = await this.db
              .select({ tax_slab_id: product_tax.tax_slab_id })
              .from(product_tax)
              .where(eq(product_tax.product_id, res.product_id))
              .limit(1)
              .catch(() => []);
            if (res.product) {
              (res.product as any).tax_slab_id = taxMapping[0]?.tax_slab_id || '';
            }
          }
          return res;
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
      const result = await this.db.query.products.findMany({
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
          category: {
            columns: { name: true },
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
    files?: ProductFiles,
  ) {
    const finalResults: {
      url: string;
      type: productImageType;
      resource_type: string;
    }[] = [];

    if (files?.product?.[0]) {
      const mainRes = await this.uploadToCloudService.uploadFile(
        files.product[0],
      );
      finalResults.push({
        url: mainRes.secure_url,
        type: productImageType.MAIN,
        resource_type: mainRes.resource_type,
      });
    }

    if (files?.product_spec && files.product_spec.length > 0) {
      const galleryRes = await this.uploadToCloudService.uploadFiles(
        files.product_spec,
      );
      finalResults.push(
        ...galleryRes.map((res) => ({
          url: res.secure_url,
          type: productImageType.GALLERY,
          resource_type: res.resource_type,
        })),
      );
    }
    try {
      const companyId = await this.resolveCompanyId(domain);
      return await this.db.transaction(async (tx) => {
        const categoryRecord = await tx
          .select({ id: categories.id })
          .from(categories)
          .where(eq(categories.id, productDto.category_id));
        if (!categoryRecord) {
          throw new Error('Category not found');
        }
        const productInsert = {
          name: productDto.name,
          description: productDto.description,
          base_price: productDto.base_price.toString(),
          discount_percent: (productDto.discount_percent || 0).toString(),
          status: productDto.status,
          features: productDto.features,
          category_id: productDto.category_id,
          vendor_id: vendorId,
          company_id: companyId,
        };
        const [createdProduct] = await tx
          .insert(products)
          .values(productInsert)
          .returning({ id: products.id });

        const [variantRecords] = await tx
          .insert(product_variants)
          .values({
            variant_name: productDto.variant_name || productDto.name,
            sku: productDto.sku,
            price: productDto.price || productDto.base_price.toString(),
            attributes: productDto.attributes,
            status: productDto.status,
            product_id: createdProduct.id,
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

        if (finalResults.length > 0) {
          const imageInserts = finalResults.map((image, index) => ({
            variant_id: variantRecords?.id,
            product_id: createdProduct?.id,
            image_url: image.url,
            alt_text: `${image.type} Image ${index + 1}`,
            is_primary: index === 0,
            imgType: image.type,
          }));
          const createdImages = await tx
            .insert(product_images)
            .values(imageInserts)
            .returning();
        }
        if (!productDto.warehouse_id && variantRecords?.id) {
          const defaultWarehouse = await tx
            .select()
            .from(warehouse)
            .where(eq(warehouse.company_id, companyId))
            .limit(1)
            .orderBy(desc(warehouse.created_at));
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
    files?: ProductFiles,
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
      .select({ product_id: product_variants.product_id, id: product_variants.id })
      .from(product_variants)
      .where(eq(product_variants.id, productVariantId))
      .limit(1)
      .catch(() => []);

    if (variantRow.length > 0) {
      resolvedProductId = variantRow[0].product_id ?? undefined;
      resolvedVariantId = variantRow[0].id;
    } else {
      const productRow = await this.db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.id, productVariantId))
        .limit(1)
        .catch(() => []);

      if (productRow.length > 0) {
        resolvedProductId = productRow[0].id;
        const firstVariant = await this.db
          .select({ id: product_variants.id })
          .from(product_variants)
          .where(eq(product_variants.product_id, resolvedProductId))
          .limit(1)
          .catch(() => []);
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
      base_price: product.base_price,
      discount_percent: product.discount_percent,
      category_id: product.category_id,
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
            .where(eq(products.id, resolvedProductId))
            .catch((error) => {
              throw new InternalServerErrorException(
                ProductsErrorKeyEnum.FAILED_TO_UPDATE_PRODUCT,
                {
                  cause: error,
                },
              );
            });

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
              for (const url of urls) {
                const publicId = extractCloudinaryPublicId(url);
                if (publicId) {
                  await this.uploadToCloudService
                    .deleteFile(publicId, 'image')
                    .then(() => {})
                    .catch((error) => {});
                }
              }
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

          const finalResults: { url: string; type: productImageType }[] = [];

          if (files?.product?.[0]) {
            const mainRes = await this.uploadToCloudService.uploadFile(
              files.product[0],
            );
            finalResults.push({
              url: mainRes.secure_url,
              type: productImageType.MAIN,
            });
          }

          if (files?.product_spec && files.product_spec.length > 0) {
            const galleryRes = await this.uploadToCloudService.uploadFiles(
              files.product_spec,
            );
            finalResults.push(
              ...galleryRes.map((res) => ({
                url: res.secure_url,
                type: productImageType.GALLERY,
              })),
            );
            imageToDeleteUrl.push(
              ...galleryRes.map((res) => ({
                url: res.secure_url,
                toDeleteUrl: undefined,
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
                is_primary: image.type === productImageType.MAIN,
                imgType: image.type,
              };
            });

            const createdImages = await tx
              .insert(product_images)
              .values(imageInserts)
              .catch((error) => {
                throw new InternalServerErrorException(
                  ProductsErrorKeyEnum.FAILED_TO_INSERT_PRODUCT_IMAGES,
                  {
                    cause: error,
                  },
                );
              });
          }

          if (targetVariantId) {
            const updateProductVariantData = {
              variant_name: product.variant_name,
              sku: product.sku,
              price: product.base_price,
              attributes: product.attributes,
              status: product.status,
              seo_meta: null,
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

  async deleteProduct(productId: string) {
    if (!productId) {
      return new HttpException(
        ProductsErrorKeyEnum.PRODUCT_ID_IS_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      await this.db
        .delete(products)
        .where(eq(products.id, productId))
        .catch((error) => {
          throw new InternalServerErrorException(
            ProductsErrorKeyEnum.FAILED_TO_DELETE_PRODUCT,
            {
              cause: error,
            },
          );
        });
      return {
        message: 'Product deleted successfully',
        status: HttpStatus.OK,
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
  async UpdateProductCategory(categoryId: string, productId: string) {
    if (!categoryId && !productId) {
      return new HttpException(
        ProductsErrorKeyEnum.CATEGORY_ID_IS_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      await this.db
        .update(products)
        .set({ category_id: categoryId })
        .where(eq(products.id, productId));
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

  async deleteSelectedProducts(productIds: string[]) {
    if (!productIds || productIds.length === 0) {
      return new HttpException(
        ProductsErrorKeyEnum.PRODUCT_IDS_ARE_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      await this.db.delete(products).where(inArray(products.id, productIds));
      return {
        message: 'Selected products deleted successfully',
        status: HttpStatus.OK,
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

  async deleteProductVariant(variantId: string) {
    if (!variantId) {
      return new HttpException(
        ProductsErrorKeyEnum.VARIANT_ID_IS_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      await this.db
        .delete(product_variants)
        .where(eq(product_variants.id, variantId));
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
  async deleteSelectedProductVariants(variantIds: string[]) {
    if (!variantIds || variantIds.length === 0) {
      return new HttpException(
        ProductsErrorKeyEnum.VARIANT_IDS_ARE_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      await this.db
        .delete(product_variants)
        .where(inArray(product_variants.id, variantIds));
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
      return new HttpException(
        ProductsErrorKeyEnum.IMAGE_ID_IS_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      await this.db
        .delete(product_images)
        .where(eq(product_images.id, imageId));
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
}
