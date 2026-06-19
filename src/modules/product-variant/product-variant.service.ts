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
import { ProductVariantErrorKeyEnum } from './constants/product-variant.enums';
@Injectable()
export class ProductVariantService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly uploadToCloudService: UploadToCloudService,
    private inventoryService: InventoryService,
    private readonly companyService: CompanyService,
  ) { }

  private async resolveCompanyId(domain: string): Promise<string> {
    const filteredDomain = domainExtractor(domain);
    return this.companyService.find(filteredDomain);
  }

  async create(
    createProductVariantDto: CreateProductVariantDto,
    domain: string,
    files: ProductFiles,
  ) {

    if (!createProductVariantDto.product_id) {
      throw new InternalServerErrorException(ProductVariantErrorKeyEnum.PRODUCT_ID_IS_REQUIRED, {
        cause: new Error('Product ID is required'),
      });
    }
    const companyId = await this.resolveCompanyId(domain);
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
        throw new InternalServerErrorException(ProductVariantErrorKeyEnum.FAILED_TO_FETCH_PRODUCT);
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
            throw new InternalServerErrorException(
              ProductVariantErrorKeyEnum.FAILED_TO_CREATE_PRODUCT_VARIANT,
            );
          });
        if (!variantRecord) {
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

        const copySpecImages: { image_url: string; alt_text: string | null }[] = [];
        if (!files?.product_spec || files.product_spec.length === 0) {
          const existingSpecImages = await tx
            .select({
              image_url: product_images.image_url,
              alt_text: product_images.alt_text,
            })
            .from(product_images)
            .where(
              and(
                eq(product_images.product_id, productId.id),
                eq(product_images.imgType, productImageType.GALLERY),
              ),
            );
          const uniqueUrls = new Set<string>();
          for (const img of existingSpecImages) {
            if (img.image_url && !uniqueUrls.has(img.image_url)) {
              uniqueUrls.add(img.image_url);
              copySpecImages.push({
                image_url: img.image_url,
                alt_text: img.alt_text,
              });
            }
          }
        }

        if (!variantRecord.id) {
          throw new InternalServerErrorException(ProductVariantErrorKeyEnum.FAILED_VARIANT_RECORD);
        }

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

        if (copySpecImages.length > 0) {
          copySpecImages.forEach((img, index) => {
            imageInserts.push({
              product_id: productId.id,
              variant_id: variantRecord.id,
              image_url: img.image_url,
              alt_text: img.alt_text || `GALLERY Image Copy ${index + 1}`,
              is_primary: false,
              imgType: productImageType.GALLERY,
            });
          });
        }

        if (imageInserts.length > 0) {
          const variantImgsResult = await tx
            .insert(product_images)
            .values(imageInserts)
            .returning()
            .catch((error) => {
              throw new InternalServerErrorException(
                ProductVariantErrorKeyEnum.FAILED_TO_INSERT_PRODUCT_IMAGES,
              );
            });
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
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException ||
        error instanceof BadRequestException
      )
        throw error;
      throw new InternalServerErrorException(
        ProductVariantErrorKeyEnum.FAILED_TO_CREATE_PRODUCT_VARIANT,
        {
          cause: error,
        },
      );
    }
  }
  async findAllVariantsByProductId(productId: string) {
    try {
      const productVariants = await this.db.query.product_variants.findMany({
        where: (product_variants) => eq(product_variants.product_id, productId),
        with: {
          images: true,
        },
      });
      return productVariants;
    } catch (error) {
      throw new InternalServerErrorException(
        ProductVariantErrorKeyEnum.FAILED_TO_FETCH_PRODUCT_VARIANTS_BY_PRODUCT_ID,
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
          product_id: product_variants.product_id,
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
          ProductVariantErrorKeyEnum.PRODUCT_VARIANT_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }
      if (productVariant.status === ProductStatus.INACTIVE) {
        throw new HttpException(
          ProductVariantErrorKeyEnum.PRODUCT_VARIANT_IS_INACTIVE,
          HttpStatus.BAD_REQUEST,
        );
      }
      return productVariant;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        ProductVariantErrorKeyEnum.FAILED_TO_FETCH_PRODUCT_VARIANT_DETAILS,
      );
    }
  }

  async findAll(vendorId: string) {
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
      throw new InternalServerErrorException(
        ProductVariantErrorKeyEnum.FAILED_TO_FETCH_PRODUCT_VARIANTS,
      );
    }
  }
  async findOne(id: string) {
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
      return productVariant;
    } catch (error) {
      throw new InternalServerErrorException(ProductVariantErrorKeyEnum.FAILED_TO_FETCH_PRODUCT_VARIANT);
    }
  }

  async update(
    id: string,
    updateProductVariantDto: UpdateProductVariantDto,
    imagesToDelete?: string[],
    files?: ProductFiles,
    domain?: string,
  ) {
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
          ProductVariantErrorKeyEnum.COMPANY_DOMAIN_IS_REQUIRED,
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
            throw new HttpException(
              ProductVariantErrorKeyEnum.PRODUCT_VARIANT_NOT_FOUND,
              HttpStatus.NOT_FOUND,
            );
          }

          await tx
            .update(product_variants)
            .set(updateData)
            .where(eq(product_variants.id, id));
          const parsedImagesToDelete = typeof imagesToDelete === 'string'
            ? JSON.parse(imagesToDelete)
            : imagesToDelete;
          if (parsedImagesToDelete && parsedImagesToDelete.length > 0) {
            await tx
              .delete(product_images)
              .where(
                and(
                  eq(product_images.variant_id, id),
                  inArray(product_images.id, parsedImagesToDelete),
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
                throw new InternalServerErrorException(
                  ProductVariantErrorKeyEnum.FAILED_TO_UPDATE_PRODUCT_VARIANT,
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
          throw new InternalServerErrorException(
            ProductVariantErrorKeyEnum.FAILED_TO_UPDATE_PRODUCT_VARIANT,
          );
        });

      return result;
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof InternalServerErrorException
      )
        throw error;

      throw new InternalServerErrorException(
        ProductVariantErrorKeyEnum.FAILED_TO_UPDATE_PRODUCT_VARIANT,
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
          attributes: product_variants.attributes,
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
          throw new InternalServerErrorException(
            ProductVariantErrorKeyEnum.FAILED_TO_FETCH_STOCK_MANAGER_DATA,
          );
        });
    } catch (error) {
      throw new InternalServerErrorException(
        ProductVariantErrorKeyEnum.FAILED_TO_FETCH_STOCK_MANAGER_DATA,
      );
    }
  }
  async UpdateProductVariantStatus(status: ProductStatus, variantId: string) {
    if (!status) {
      return new HttpException(
        ProductVariantErrorKeyEnum.PRODUCT_STATUS_IS_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const [result] = await this.db
        .update(product_variants)
        .set({ status })
        .where(eq(product_variants.id, variantId))
        .returning({ product_id: product_variants.product_id })
        .catch((err) => {
          throw new InternalServerErrorException(
            ProductVariantErrorKeyEnum.FAILED_TO_UPDATE_PRODUCT_VARIANT_STATUS,
            {
              cause: err,
            },
          );
        });

      if (!result || !result.product_id) {
        throw new HttpException(
          ProductVariantErrorKeyEnum.PRODUCT_VARIANT_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }
      const productVariant = await this.db.select().from(product_variants).where(and(eq(product_variants.product_id, result.product_id), eq(product_variants.status, ProductStatus.ACTIVE)))
      if (productVariant.length == 0) {
        await this.db.update(products).set({ status: ProductStatus.INACTIVE }).where(eq(products.id, result.product_id)).catch((err) => {
          throw new InternalServerErrorException(
            ProductVariantErrorKeyEnum.FAILED_TO_UPDATE_PRODUCT_STATUS,
            {
              cause: err,
            },
          );
        })
      }

      return {
        message: 'Product variant status updated successfully',
        status: HttpStatus.OK,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        ProductVariantErrorKeyEnum.FAILED_TO_UPDATE_PRODUCT_STATUS,
        {
          cause: error,
        },
      );
    }
  }

  async delete(id: string) {
    try {
      if (!id) {
        throw new HttpException(ProductVariantErrorKeyEnum.ID_REQUIRED, HttpStatus.BAD_REQUEST);
      }
      const result = await this.db
        .delete(product_variants)
        .where(eq(product_variants.id, id));
      if (!result) {
        throw new Error(`Product variant with ID ${id} not found`);
      }
      return result;
    } catch (error) {
      throw new InternalServerErrorException(
        ProductVariantErrorKeyEnum.FAILED_TO_DELETE_PRODUCT_VARIANT,
      );
    }
  }
}
