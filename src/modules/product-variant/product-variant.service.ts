import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import { and, eq, inArray } from 'drizzle-orm';
import {
  inventory,
  product_images,
  product_variants,
  products,
  warehouse,
} from '../../drizzle/schema';
import { productImageType, ProductStatus } from '../../drizzle/types/types';
import { UploadToCloudService } from '../../utils/upload-to-cloud/upload-to-cloud.service';
import { ProductFiles } from '../../common/Types/index.type';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import { CompanyService } from '../company/company.service';
import { InventoryService } from '../inventory/inventory.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
@Injectable()
export class ProductVariantService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly uploadToCloudService: UploadToCloudService,
    private inventoryService: InventoryService,
    private readonly companyService: CompanyService,
  ) {}

  private async resolveCompanyId(domain: string): Promise<string> {
    console.log(
      `[ProductVariantService.resolveCompanyId] Resolving company for domain: ${domain}`,
    );
    const filteredDomain = domainExtractor(domain);
    return this.companyService.find(filteredDomain);
  }

  async create(
    createProductVariantDto: CreateProductVariantDto,
    domain: string,
    files: ProductFiles,
  ) {
    console.log('[ProductVariantService.create] Request received', {
      domain,
      sku: createProductVariantDto.sku,
    });

    if (!createProductVariantDto.product_id) {
      console.log(
        '[ProductVariantService.create] Stopping: Product ID is missing',
      );
      throw new InternalServerErrorException('Product ID is required', {
        cause: new Error('Product ID is required'),
      });
    }
    const companyId = await this.resolveCompanyId(domain);
    console.log('[ProductVariantService.create] Querying product validation', {
      productId: createProductVariantDto.product_id,
    });
    const [productId] = await this.db
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          eq(products.id, createProductVariantDto.product_id),
          eq(products.company_id, companyId),
        ),
      )
      .catch((error) => {
        console.error(
          '[ProductVariantService.create] Error fetching product:',
          error,
        );
        throw new InternalServerErrorException('Failed to fetch product');
      });
    const variantData = {
      variant_name: createProductVariantDto.variant_name,
      sku: createProductVariantDto.sku,
      price: createProductVariantDto.price,
      attributes: createProductVariantDto.attributes,
      status: createProductVariantDto.status,
      seo_meta: createProductVariantDto.seo_meta ?? null,
      product_id: productId.id,
    };

    try {
      const productVariantRecord = await this.db.transaction(async (tx) => {
        const [variantRecord] = await tx
          .insert(product_variants)
          .values(variantData)
          .returning({
            id: product_variants.id,
          })
          .catch((error) => {
            console.error(
              '[ProductVariantService.create] Error creating product variant:',
              error,
            );
            throw new InternalServerErrorException(
              'Failed to create product variant',
            );
          });
        console.log('[ProductVariantService.create] Variant record created', {
          variantId: variantRecord?.id,
        });
        if (!variantRecord) {
          console.log(
            '[ProductVariantService.create] Stopping: Failed to create variant',
          );
          throw new Error('Failed to create product variant');
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

        if (files?.product_spec && files.product_spec?.length > 0) {
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
        console.log(
          '[ProductVariantService.create] Uploaded images to cloud:',
          finalResults.length,
        );

        if (!variantRecord.id) {
          console.log(
            '[ProductVariantService.create] Stopping: Failed variant record id',
          );
          throw new InternalServerErrorException('Failed variant record');
        }
        if (finalResults.length > 0) {
          const imageInserts = finalResults.map((image, index) => {
            return {
              product_id: productId.id,
              variant_id: variantRecord.id,
              image_url: `${image.url}`,
              alt_text: `${image.type} Image ${index + 1}`,
              is_primary: image.type === productImageType.MAIN,
              imgType: image.type,
            };
          });

          const variantImgsResult = await tx
            .insert(product_images)
            .values(imageInserts)
            .returning()
            .catch((error) => {
              console.error(
                '[ProductVariantService.create] Error inserting product images:',
                error,
              );
              throw new InternalServerErrorException(
                'Failed to insert product images',
              );
            });
          console.log(
            '[ProductVariantService.create] Variant images inserted',
            { count: variantImgsResult.length },
          );
        }
        if (createProductVariantDto.warehouse_id && variantRecord?.id) {
          await this.inventoryService.setStock(
            variantRecord.id,
            createProductVariantDto.warehouse_id,
            createProductVariantDto.stock_quantity ?? 0,
            companyId,
            tx as DrizzleService,
          );
        }
        return variantRecord;
      });
      console.log(
        '[ProductVariantService.create] Product variant transaction complete',
      );
    } catch (error) {
      console.error(
        '[ProductVariantService.create] Error creating product variant:',
        error,
      );
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException ||
        error instanceof BadRequestException
      )
        throw error;
      throw new InternalServerErrorException(
        'Failed to create product variant',
        {
          cause: error,
        },
      );
    }
  }
  async findAllVariantsByProductId(productId: string) {
    console.log(
      '[ProductVariantService.findAllVariantsByProductId] Request received for product:',
      productId,
    );
    try {
      const productVariants = await this.db.query.product_variants.findMany({
        where: (product_variants) => eq(product_variants.product_id, productId),
        with: {
          images: true,
        },
      });
      return productVariants;
    } catch (error) {
      console.error(
        '[ProductVariantService.findAllVariantsByProductId] Error fetching product variants by product ID:',
        error,
      );
      throw new InternalServerErrorException(
        'Failed to fetch product variants by product ID',
      );
    }
  }
  async findVariantDetailsById(variantId: string) {
    try {
      const [productVariant] = await this.db
        .select({
          id: product_variants.id,
          variant_name: product_variants.variant_name,
          sku: product_variants.sku,
          price: product_variants.price,
          status: product_variants.status,
          images: product_images.image_url,
        })
        .from(product_variants)
        .innerJoin(
          product_images,
          and(
            eq(product_images.variant_id, product_variants.id),
            eq(product_images.is_primary, true),
          ),
        )
        .where(eq(product_variants.id, variantId))
        .limit(1);
      if (!productVariant) {
        throw new HttpException(
          'Product variant not found',
          HttpStatus.NOT_FOUND,
        );
      }
      if (productVariant.status === ProductStatus.INACTIVE) {
        throw new HttpException(
          'Product variant is inactive',
          HttpStatus.BAD_REQUEST,
        );
      }
      console.log(
        '[ProductVariantService.findVariantDetailsById] Sending product variant details',
        { id: productVariant.id },
      );
      return productVariant;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error(
        '[ProductVariantService.findVariantDetailsById] Error fetching product variant details:',
        error,
      );
      throw new InternalServerErrorException(
        'Failed to fetch product variant details',
      );
    }
  }

  async findAll(vendorId: string) {
    console.log(
      '[ProductVariantService.findAll] Request received for vendor:',
      vendorId,
    );
    try {
      const product = await this.db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.vendor_id, vendorId));
      if (product.length === 0) {
        return [];
      }
      const productIds = product.map((p) => p.id);
      const productVariants = await this.db.query.product_variants.findMany({
        where: (product_variants) =>
          inArray(product_variants.product_id, productIds),
        with: {
          images: true,
          inventory: {
            columns: {
              stock_quantity: true,
              warehouse_id: true,
            },
          },
        },
      });
      return productVariants;
    } catch (error) {
      console.error(
        '[ProductVariantService.findAll] Error fetching product variants:',
        error,
      );
      throw new InternalServerErrorException(
        'Failed to fetch product variants',
      );
    }
  }
  async findOne(id: string) {
    console.log('[ProductVariantService.findOne] Request received for id:', id);
    try {
      const productVariant = await this.db.query.product_variants.findFirst({
        where: (product_variants) => eq(product_variants.id, id),
        with: {
          product: true,
          images: true,
          inventory: {
            columns: {
              stock_quantity: true,
              warehouse_id: true,
            },
          },
        },
      });
      if (!productVariant) {
        throw new Error(`Product variant with ID ${id} not found`);
      }
      console.log('[ProductVariantService.findOne] Product variant found');
      return productVariant;
    } catch (error) {
      console.error(
        '[ProductVariantService.findOne] Error fetching product variant:',
        error,
      );
      throw new InternalServerErrorException('Failed to fetch product variant');
    }
  }

  async update(
    id: string,
    updateProductVariantDto: UpdateProductVariantDto,
    imagesToDelete?: string[],
    files?: ProductFiles,
    domain?: string,
  ) {
    console.log('[ProductVariantService.update] Request received', {
      id,
      domain,
    });
    const updateData: Partial<UpdateProductVariantDto> = {
      variant_name: updateProductVariantDto.variant_name,
      sku: updateProductVariantDto.sku,
      price: updateProductVariantDto.price,
      attributes: updateProductVariantDto.attributes,
      status: updateProductVariantDto.status,
      seo_meta: updateProductVariantDto.seo_meta ?? null,
    };

    try {
      if (!domain) {
        throw new HttpException(
          'Company domain is required',
          HttpStatus.BAD_REQUEST,
        );
      }
      const companyId = await this.resolveCompanyId(domain);
      const result = await this.db
        .transaction(async (tx) => {
          const [existingVariant] = await tx
            .select({
              id: product_variants.id,
              product_id: product_variants.product_id,
            })
            .from(product_variants)
            .where(eq(product_variants.id, id))
            .limit(1);

          if (!existingVariant) {
            console.log(
              '[ProductVariantService.update] Stopping: Product variant not found',
            );
            throw new HttpException(
              'Product variant not found',
              HttpStatus.NOT_FOUND,
            );
          }

          await tx
            .update(product_variants)
            .set(updateData)
            .where(eq(product_variants.id, id));

          if (imagesToDelete && imagesToDelete.length > 0) {
            await tx
              .delete(product_images)
              .where(
                and(
                  eq(product_images.variant_id, id),
                  inArray(product_images.id, imagesToDelete),
                ),
              );
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
          }

          if (finalResults.length > 0 && existingVariant.product_id !== null) {
            const imageInserts = finalResults.map((image, index) => {
              if (!existingVariant.product_id) {
                console.log(
                  '[ProductVariantService.update] Stopping: existing variant id is null',
                  existingVariant,
                );
                throw new InternalServerErrorException(
                  'Failed to update product variant',
                );
              }
              return {
                variant_id: id,
                product_id: existingVariant.product_id,
                image_url: image.url,
                alt_text: `${image.type} Image ${index + 1}`,
                is_primary: image.type === productImageType.MAIN,
                imgType: image.type,
              };
            });

            await tx.insert(product_images).values(imageInserts);
          }
          if (updateProductVariantDto.warehouse_id && existingVariant?.id) {
            await this.inventoryService.setStock(
              existingVariant.id,
              updateProductVariantDto.warehouse_id,
              updateProductVariantDto.stock_quantity ?? 0,
              companyId,
              tx as DrizzleService,
            );
          }
          return { ...existingVariant, ...updateData };
        })
        .catch((error) => {
          console.error(
            '[ProductVariantService.update] transaction Error updating product variant:',
            error,
          );
          throw new InternalServerErrorException(
            'Failed to update product variant',
          );
        });

      return result;
    } catch (error) {
      console.error(
        '[ProductVariantService.update] Error updating product variant:',
        error,
      );
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      )
        throw error;

      console.error('[ProductVariantService.update] Update Error:', error);
      throw new InternalServerErrorException(
        'Failed to update product variant',
      );
    }
  }
  async getVariantsForStockManager(domain: string) {
    const filteredDomain = domainExtractor(domain);
    const companyId = await this.companyService.find(filteredDomain);

    try {
      // Perform a direct SQL-level join to flatten the data instantly
      return await this.db
        .select({
          variantId: product_variants.id,
          productId: products.id,
          productName: products.name,
          variantName: product_variants.variant_name,
          sku: product_variants.sku,
          status: product_variants.status,
          stock: inventory.stock_quantity,
          warehouseId: inventory.warehouse_id,
          warehouseName: warehouse.warehouse_name,
        })
        .from(product_variants)
        .innerJoin(products, eq(product_variants.product_id, products.id))
        .leftJoin(
          inventory,
          eq(product_variants.id, inventory.product_variant_id),
        )
        .leftJoin(warehouse, eq(inventory.warehouse_id, warehouse.id))
        .where(eq(products.company_id, companyId))
        .catch((error) => {
          console.error(
            '[ProductVariantService.getVariantsForStockManager] Error fetching stock manager variants:',
            error,
          );
          throw new InternalServerErrorException(
            'Failed to fetch stock manager data',
          );
        });
    } catch (error) {
      console.error('Error fetching stock manager variants:', error);
      throw new InternalServerErrorException(
        'Failed to fetch stock manager data',
      );
    }
  }
  async UpdateProductVariantStatus(status: ProductStatus, productId: string) {
    console.log(
      '[ProductVariantService.UpdateProductVarintStatus] Request received',
      { productId, status },
    );
    if (!status) {
      console.log(
        '[ProductVariantService.UpdateProductVarintStatus] Stopping: Product status is required',
      );
      return new HttpException(
        'Product status is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    console.log(
      '[ProductVariantService.UpdateProductVarintStatus] Updating product variant status in DB',
    );

    try {
      const result = await this.db
        .update(product_variants)
        .set({ status })
        .where(eq(product_variants.id, productId))
        .returning()
        .catch((err) => {
          console.error(
            '[ProductVariantService.UpdateProductVarintStatus] Error updating product variant status:',
            err,
          );
          throw new InternalServerErrorException(
            'Failed to update product variant status',
            {
              cause: err,
            },
          );
        });
      console.log(
        '[ProductVariantService.UpdateProductVarintStatus] Product variant status updated',
        { resultLength: result.length },
      );
      return {
        message: 'Product variant status updated successfully',
        status: HttpStatus.OK,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to update product status',
        {
          cause: error,
        },
      );
    }
  }

  async delete(id: string) {
    console.log('[ProductVariantService.delete] Request received for id:', id);
    try {
      if (!id) {
        console.log('[ProductVariantService.delete] Stopping: id required');
        throw new HttpException('id required', HttpStatus.BAD_REQUEST);
      }
      console.log(
        '[ProductVariantService.delete] Deleting product variant from DB',
      );
      const result = await this.db
        .delete(product_variants)
        .where(eq(product_variants.id, id));
      if (!result) {
        console.log(
          '[ProductVariantService.delete] Stopping: Product variant not found',
        );
        throw new Error(`Product variant with ID ${id} not found`);
      }
      console.log(
        '[ProductVariantService.delete] Variant deleted successfully',
      );
      return result;
    } catch (error) {
      console.error(
        '[ProductVariantService.delete] Error deleting product variant:',
        error,
      );
      throw new InternalServerErrorException(
        'Failed to delete product variant',
      );
    }
  }
}
