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
  product_reviews,
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
  lte,
  or,
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
    console.log(
      `[ProductsService.resolveCompanyId] Resolving company for domain: ${domain}`,
    );
    const filterDomain = domainExtractor(domain);
    console.log(
      `[ProductsService.resolveCompanyId] Extracted filter domain: ${filterDomain}`,
    );
    console.log(
      `[ProductsService.resolveCompanyId] Querying CompanyService.find(...)`,
    );
    return this.companyService.find(filterDomain);
  }
  async getAllProducts(domain: string, query: GetProductsQueryDto = {}) {
    console.log('[ProductsService.getAllProducts] Request received', query);
    try {
      const companyId = await this.resolveCompanyId(domain);
      const {
        offset = 0,
        limit = 12,
        search,
        category_id,
        min_price,
        max_price,
        sort_by = SortBy.NEWEST,
      } = query;

      // ── Build WHERE conditions ──────────────────────────────────────────────
      const conditions = [eq(products.company_id, companyId)];

      if (search && search.trim()) {
        const term = `%${search.trim()}%`;
        conditions.push(
          or(
            ilike(products.name, term),
            ilike(products.description, term),
          ) as any,
        );
      }

      if (category_id) {
        conditions.push(eq(products.category_id, category_id));
      }

      if (min_price !== undefined) {
        conditions.push(gte(products.base_price, String(min_price)));
      }

      if (max_price !== undefined) {
        conditions.push(lte(products.base_price, String(max_price)));
      }

      const where = and(...conditions);

      // ── Sorting ─────────────────────────────────────────────────────────────
      const orderBy = (() => {
        switch (sort_by) {
          case SortBy.PRICE_ASC:
            return asc(sql`CAST(${products.base_price} AS NUMERIC)`);
          case SortBy.PRICE_DESC:
            return desc(sql`CAST(${products.base_price} AS NUMERIC)`);
          case SortBy.NAME_ASC:
            return asc(products.name);
          case SortBy.DISCOUNT:
            return desc(sql`CAST(${products.discount_percent} AS NUMERIC)`);
          case SortBy.NEWEST:
          default:
            return desc(products.created_at);
        }
      })();

      // ── Total count (for pagination) ─────────────────────────────────────────
      const [{ total }] = await this.db
        .select({ total: count() })
        .from(products)
        .where(where);

      // ── Paginated IDs ────────────────────────────────────────────────────────
      // Fetch IDs first (fast), then hydrate with relations
      const productIds = await this.db
        .select({ id: products.id })
        .from(products)
        .where(where)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);

      if (productIds.length === 0) {
        return {
          data: [],
          total: Number(total),
          offset,
          limit,
        };
      }

      const ids = productIds.map((p) => p.id);

      // ── Hydrate with relations ───────────────────────────────────────────────
      const productList = await this.db.query.products.findMany({
        where: (p) => or(...ids.map((id) => eq(p.id, id))) as any,
        with: {
          category: true,
          variants: {
            columns: {
              id: true,
              variant_name: true,
              price: true,
              sku: true,
              status: true,
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
      });

      // Re-sort to match the ordered IDs from the paginated query
      const idOrder = new Map(ids.map((id, i) => [id, i]));
      productList.sort(
        (a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0),
      );

      return {
        data: productList,
        total: Number(total),
        offset,
        limit,
        totalPages: Math.ceil(Number(total) / limit),
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch products', {
        cause: error,
      });
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
        .where(
          and(
            eq(products.company_id, companyId),
            or(
              ilike(products.name, term),
              ilike(products.description, term),
            ) as any,
          ),
        )
        .limit(8)
        .orderBy(asc(products.name));
      return { data: suggestions };
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch suggestions');
    }
  }

  async getAllProductOptions(domain: string) {
    console.log('[ProductsService.getAllProductOptions] Request received');
    try {
      console.log(
        `[ProductsService.getAllProductOptions] Resolving company id for domain: ${domain}`,
      );
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        `[ProductsService.getAllProductOptions] Querying product options for company_id: ${companyId}`,
      );
      const productOptions = await this.db
        .select({ id: products.id, name: products.name })
        .from(products)
        .where(eq(products.company_id, companyId))
        .catch((e) => {
          console.log('error in fetching products', e);
          return [];
        });
      console.log('response product ', productOptions);
      return productOptions;
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch products', {
        cause: error,
      });
    }
  }
  async getProductMainDetails(productId: string, domain: string) {
    console.log(
      `[ProductsService.getProductMainDetails] Request received for productId: ${productId}`,
    );
    try {
      console.log(
        `[ProductsService.getProductMainDetails] Querying product main details for id: ${productId}`,
      );
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
          console.error('Error fetching product by ID:', error);
          throw new InternalServerErrorException('Failed to fetch product', {
            cause: error,
          });
        });
      if (!productRecord) {
        throw new HttpException('Product not found', HttpStatus.NOT_FOUND);
      }
      console.log('sending product main details', productRecord);
      return productRecord;
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch product', {
        cause: error,
      });
    }
  }

  async getProductById(productId: string, domain: string) {
    console.log(
      `[ProductsService.getProductById] Request received for productId: ${productId}`,
    );
    try {
      console.log(
        `[ProductsService.getProductById] Resolving company id for domain: ${domain}`,
      );
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        `[ProductsService.getProductById] Querying product by id: ${productId} and company_id: ${companyId}`,
      );
      const productRecord = await this.db.query.products
        .findFirst({
          where: and(
            eq(products.id, productId),
            eq(products.company_id, companyId),
          ),
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
          console.error('Error fetching product by ID:', error);
          throw new InternalServerErrorException('Failed to fetch product', {
            cause: error,
          });
        });

      if (!productRecord) {
        throw new HttpException('Product not found', HttpStatus.NOT_FOUND);
      }
      console.log(
        `[ProductsService.getProductById] Product record:`,
        productRecord?.id,
      );
      return productRecord;
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch product', {
        cause: error,
      });
    }
  }
  async getProductDetailsById(productVariantId: string, domain: string) {
    console.log(
      `[ProductsService.getProductDetailsById] Request received for productVariantId: ${productVariantId}`,
    );
    try {
      console.log(
        `[ProductsService.getProductDetailsById] Checking product variant existence for id: ${productVariantId}`,
      );
      const isProductVariantExist = await this.db
        .select({ id: product_variants.id })
        .from(product_variants)
        .where(eq(product_variants.id, productVariantId))
        .catch((error) => {
          console.error('Error checking product variant existence:', error);
          throw new InternalServerErrorException(
            'Failed to check product variant existence',
          );
        });
      console.log(
        `[ProductsService.getProductDetailsById] isProductVariantExist:`,
        isProductVariantExist,
      );

      console.log(
        `[ProductsService.getProductDetailsById] Querying product variant details for id: ${productVariantId}`,
      );
      const productVariant = await this.db.query.product_variants
        .findFirst({
          where: eq(product_variants.id, productVariantId),
          with: {
            images: true,
            product: {
              columns: {
                name: true,
                description: true,
                features: true,
                base_price: true,
                discount_percent: true,
                status: true,
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
        .then((res) => {
          console.log('res', res);
          return res;
        })
        .catch((error) => {
          console.error('Error fetching product by ID:', error);
          throw new InternalServerErrorException('Failed to fetch product', {
            cause: error,
          });
        });
      if (!productVariant) {
        throw new HttpException(
          'Product variant not found',
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
      throw new InternalServerErrorException('Failed to fetch product', {
        cause: error,
      });
    }
  }
  async getActiveProducts(domain: string) {
    console.log(`[ProductsService.getActiveProducts] Request received`);
    try {
      console.log(
        `[ProductsService.getActiveProducts] Resolving company id for domain: ${domain}`,
      );
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        `[ProductsService.getActiveProducts] Querying active products for company_id: ${companyId}`,
      );
      const result = await this.db.query.products.findMany({
        where: and(eq(products.company_id, companyId)),
        columns: {
          id: true,
          created_at: true,
        },
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
      console.log('response', response);
      return response;
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to fetch active products',
        {
          cause: error,
        },
      );
    }
  }
  async createProduct(
    productDto: CreateProductDto,
    vendorId: string,
    domain: string,
    files?: ProductFiles,
  ) {
    console.log('[ProductsService.createProduct] Request received');
    console.log(
      '[ProductsService.createProduct] Incoming payload:',
      productDto,
    );
    const finalResults: { url: string; type: productImageType }[] = [];

    if (files?.product?.[0]) {
      const mainRes = await this.uploadToCloudService.uploadFile(
        files.product[0],
      );
      console.log('productImageType.GALLERY', productImageType.GALLERY);
      console.log('productImageType.MAIN', productImageType.MAIN);
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
    }
    console.log(`[ProductsService.createProduct] domain: ${domain}`);
    try {
      console.log(
        `[ProductsService.createProduct] Resolving company id for domain: ${domain}`,
      );
      const companyId = await this.resolveCompanyId(domain);
      return await this.db.transaction(async (tx) => {
        console.log(
          `[ProductsService.createProduct] Querying category for id: ${productDto.category_id}`,
        );
        const categoryRecord = await tx
          .select({ id: categories.id })
          .from(categories)
          .where(eq(categories.id, productDto.category_id));
        console.log(
          `[ProductsService.createProduct] categoryRecord:`,
          categoryRecord,
        );
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
        console.log(
          '[ProductsService.createProduct] Inserting product into database',
          productInsert,
        );
        const [createdProduct] = await tx
          .insert(products)
          .values(productInsert)
          .returning({ id: products.id });

        console.log(
          '[ProductsService.createProduct] createdProduct:',
          createdProduct,
        );
        console.log(
          '[ProductsService.createProduct] Inserting product variant into database',
        );
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
            console.error('Error inserting product variant:', error);
            throw new InternalServerErrorException(
              'Failed to create product variant',
              {
                cause: error,
              },
            );
          });

        console.log('variantRecords', variantRecords);
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
          console.log('createdImages', createdImages);
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
          console.log('inventoryResult', inventoryResult);
        }
        if (productDto.warehouse_id && variantRecords?.id) {
          const inventoryResult = await this.inventoryService.setStock(
            variantRecords.id,
            productDto.warehouse_id,
            productDto.stock_quantity ?? 0,
            companyId,
            tx as DrizzleService, // pass transaction context
          );
          console.log('inventoryResult', inventoryResult);
        }
        await tx
          .insert(product_tax)
          .values({
            product_id: createdProduct.id,
            tax_rate_id: productDto.tax_rate_id,
          })
          .catch((error) => {
            console.error('Error inserting product tax mapping:', error);
            throw new InternalServerErrorException(
              'Failed to create product tax mapping',
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
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to register vendor', {
        cause: error,
      });
    }
  }
  async updateProduct(
    domain: string,
    productVariantId: string,
    product: UpdateProductDto,
    imagesToDelete?: string[],
    files?: ProductFiles,
  ) {
    console.log(
      `[ProductsService.updateProduct] Request received for productVariantId: ${productVariantId}`,
    );
    console.log('[ProductsService.updateProduct] Incoming payload:', product);
    console.log(
      '[ProductsService.updateProduct] imagesToDelete:',
      imagesToDelete,
    );
    if (!productVariantId) {
      return new HttpException(
        'Product Variant ID is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    console.log(
      `[ProductsService.updateProduct] Resolving company id for domain: ${domain}`,
    );
    const companyId = await this.resolveCompanyId(domain);
    console.log(
      `[ProductsService.updateProduct] Querying product_id for variant id: ${productVariantId}`,
    );
    const [productId] = await this.db
      .select({
        product_id: product_variants.product_id,
      })
      .from(product_variants)
      .where(eq(product_variants.id, productVariantId))
      .then((res) => {
        console.log('[ProductsService.updateProduct] productId:', res);
        return res.map((item) => item.product_id);
      })
      .catch((error) => {
        console.error('Error fetching product variant:', error);
        throw new InternalServerErrorException(
          'Failed to fetch product variant',
          {
            cause: error,
          },
        );
      });
    if (!productId && productId === null) {
      throw new HttpException(
        'Product ID not found for the given variant',
        HttpStatus.NOT_FOUND,
      );
    }
    const productUpdatedData = {
      name: product.name,
      description: product.description,
      features: product.features,
      base_price: product.base_price,
      discount_percent: product.discount_percent,

      status: product.status,
    };
    try {
      if (!product) {
        throw new HttpException(
          'Product data not valid',
          HttpStatus.BAD_REQUEST,
        );
      }
      await this.db
        .transaction(async (tx) => {
          console.log(
            `[ProductsService.updateProduct] Updating product id: ${productVariantId}`,
          );
          const updatedProductResult = await tx
            .update(products)
            .set(productUpdatedData)
            .where(eq(products.id, productVariantId))
            .catch((error) => {
              console.error('Error updating product:', error);
              throw new InternalServerErrorException(
                'Failed to update product',
                {
                  cause: error,
                },
              );
            });
          console.log('updatedProductResult', updatedProductResult);
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
          }
          console.log('finalResults *******', product.variant_id);
          if (finalResults.length > 0 && product.variant_id) {
            const imageInserts = finalResults.map((image, index) => {
              console.log('images inserts');
              console.table(image);
              return {
                variant_id: product.variant_id,
                product_id: productId,
                image_url: image.url,
                alt_text: `${image.type} Image ${index + 1}`,
                is_primary: image.type === productImageType.MAIN,
                imgType: image.type,
              };
            });
            console.table(imageInserts);
            const createdImages = await tx
              .insert(product_images)
              .values(imageInserts)
              .catch((error) => {
                console.error('Error inserting product images:', error);
                throw new InternalServerErrorException(
                  'Failed to insert product images',
                  {
                    cause: error,
                  },
                );
              });
            console.log('createdImages', createdImages);
            console.log('imagesToDelete', imagesToDelete);
            const imagesToDeleteIds = imagesToDelete?.map((id) => id);
            if (imagesToDeleteIds && imagesToDeleteIds.length > 0) {
              const urls = await tx
                .select({ image_url: product_images.image_url })
                .from(product_images)
                .where(inArray(product_images.id, imagesToDeleteIds))
                .then((res) => {
                  console.log('urls to delete', res);
                  return res.map((item) => item.image_url);
                })
                .catch((error) => {
                  console.error(
                    'Error fetching image URLs for deletion:',
                    error,
                  );
                  throw new InternalServerErrorException(
                    'Failed to fetch image URLs for deletion',
                    {
                      cause: error,
                    },
                  );
                });
              if (urls && urls.length > 0) {
                for (const url of urls) {
                  console.log('deleting image from cloudinary', url);
                  const publicId = extractCloudinaryPublicId(url);
                  console.log('extracted publicId', publicId);
                  await this.uploadToCloudService
                    .deleteFile(publicId!)
                    .then(() => {
                      console.log(`Deleted image from cloud storage: ${url}`);
                    })
                    .catch((error) => {
                      console.error(
                        'Error deleting image from cloud storage:',
                        error,
                      );
                    });
                }
              }
            }
            if (imagesToDelete) {
              console.log('starting deleting images');
              const deletePromises = imagesToDelete.map(
                async (id) =>
                  await tx
                    .delete(product_images)
                    .where(
                      or(
                        eq(product_images.id, id),
                        eq(product_images.product_id, id),
                      ),
                    )
                    .then(() => {
                      console.log(`Deleted product image with ID: ${id}`);
                      return id;
                    })
                    .catch((error) => {
                      console.error('Error deleting product image:', error);
                      throw new InternalServerErrorException(
                        'Failed to delete product image',
                        {
                          cause: error,
                        },
                      );
                    }),
              );
              const deletedImages = await Promise.all(deletePromises);
              console.log('deletedImages', deletedImages);
            }
            console.log();
            const updateProductVariantData = {
              variant_name: product.variant_name,
              sku: product.sku,
              price: product.base_price,
              attributes: product.attributes,
              status: product.status,
              seo_meta: null,
            };
            console.log('updateProductVariantDat', updateProductVariantData);
            const updatedVariantResult = await tx
              .update(product_variants)
              .set(updateProductVariantData)
              .where(
                and(
                  eq(product_variants.product_id, productId),
                  eq(product_variants.id, productVariantId),
                ),
              )
              .catch((error) => {
                console.error('Error updating product variant:', error);
                throw new InternalServerErrorException(
                  'Failed to update product variant',
                  {
                    cause: error,
                  },
                );
              });
            console.log('updatedVariantResult', updatedVariantResult);
          }
          if (product.warehouse_id && productVariantId) {
            await this.inventoryService.setStock(
              productVariantId,
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
          console.error('Error in transaction:', error);
          throw new InternalServerErrorException('Failed to update product', {
            cause: error,
          });
        });
    } catch (error) {
      throw new InternalServerErrorException('Failed to register vendor', {
        cause: error,
      });
    }
  }

  async deleteProduct(productId: string) {
    console.log(
      `[ProductsService.deleteProduct] Request received for productId: ${productId}`,
    );
    if (!productId) {
      console.log(
        '[ProductsService.deleteProduct] Stopping: productId is missing',
      );
      return new HttpException(
        'Product ID is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      console.log(
        `[ProductsService.deleteProduct] Deleting product id: ${productId}`,
      );
      await this.db
        .delete(products)
        .where(eq(products.id, productId))
        .catch((error) => {
          console.error('Error deleting product:', error);
          throw new InternalServerErrorException('Failed to delete product', {
            cause: error,
          });
        });
      return {
        message: 'Product deleted successfully',
        status: HttpStatus.OK,
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to delete product', {
        cause: error,
      });
    }
  }
  async UpdateProductCategory(categoryId: string, productId: string) {
    console.log(
      `[ProductsService.UpdateProductCategory] Request received for categoryId: ${categoryId}, productId: ${productId}`,
    );
    if (!categoryId && !productId) {
      console.log(
        '[ProductsService.UpdateProductCategory] Stopping: categoryId or productId is missing',
      );
      return new HttpException(
        'Category ID is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      console.log(
        `[ProductsService.UpdateProductCategory] Updating product category for productId: ${productId}`,
      );
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
        'Failed to update product category',
        {
          cause: error,
        },
      );
    }
  }

  async deleteSelectedProducts(productIds: string[]) {
    console.log(
      `[ProductsService.deleteSelectedProducts] Request received for productIds:`,
      productIds,
    );
    if (!productIds || productIds.length === 0) {
      console.log(
        '[ProductsService.deleteSelectedProducts] Stopping: productIds array is empty',
      );
      return new HttpException(
        'Product IDs are required',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      console.log(
        `[ProductsService.deleteSelectedProducts] Deleting selected products`,
      );
      const deletePromises = productIds.map((id) =>
        this.db.delete(products).where(eq(products.id, id)),
      );
      await Promise.all(deletePromises);
      return {
        message: 'Selected products deleted successfully',
        status: HttpStatus.OK,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to delete  selected products',
        {
          cause: error,
        },
      );
    }
  }

  async deleteProductVariant(variantId: string) {
    console.log(
      `[ProductsService.deleteProductVariant] Request received for variantId: ${variantId}`,
    );
    if (!variantId) {
      console.log(
        '[ProductsService.deleteProductVariant] Stopping: variantId is missing',
      );
      return new HttpException(
        'Variant ID is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      console.log(
        `[ProductsService.deleteProductVariant] Deleting product variant id: ${variantId}`,
      );
      await this.db
        .delete(product_variants)
        .where(eq(product_variants.id, variantId));
      return {
        message: 'Product variant deleted successfully',
        status: HttpStatus.OK,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to delete product variant',
        {
          cause: error,
        },
      );
    }
  }
  async deleteSelectedProductVariants(variantIds: string[]) {
    console.log(
      `[ProductsService.deleteSelectedProductVariants] Request received for variantIds:`,
      variantIds,
    );
    if (!variantIds || variantIds.length === 0) {
      console.log(
        '[ProductsService.deleteSelectedProductVariants] Stopping: variantIds array is empty',
      );
      return new HttpException(
        'Variant IDs are required',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      console.log(
        `[ProductsService.deleteSelectedProductVariants] Deleting selected product variants`,
      );
      const deletePromises = variantIds.map((id) =>
        this.db.delete(product_variants).where(eq(product_variants.id, id)),
      );
      await Promise.all(deletePromises);
      return {
        message: 'Product variant deleted successfully',
        status: HttpStatus.OK,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to delete product variant',
        {
          cause: error,
        },
      );
    }
  }
  async deleteProductImage(imageId: string) {
    console.log(
      `[ProductsService.deleteProductImage] Request received for imageId: ${imageId}`,
    );
    if (!imageId) {
      console.log(
        '[ProductsService.deleteProductImage] Stopping: imageId is missing',
      );
      return new HttpException('Image ID is required', HttpStatus.BAD_REQUEST);
    }
    try {
      console.log(
        `[ProductsService.deleteProductImage] Deleting product image id: ${imageId}`,
      );
      await this.db
        .delete(product_images)
        .where(eq(product_images.id, imageId));
      return {
        message: 'Product image deleted successfully',
        status: HttpStatus.OK,
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to delete product image', {
        cause: error,
      });
    }
  }
}
