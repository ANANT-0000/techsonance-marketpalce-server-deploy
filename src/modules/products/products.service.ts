import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { DRIZZLE, type DrizzleService } from 'src/drizzle/drizzle.module';
import { CreateProductDto } from './dto/createProduct.dto';
import {
  categories,
  product_images,
  product_reviews,
  product_variants,
  products,
} from 'src/drizzle/schema/shop.schema';
import { productImageType, ProductStatus } from 'src/drizzle/types/types';
import { and, desc, eq, or } from 'drizzle-orm';

import { UploadToCloudService } from 'src/utils/upload-to-cloud/upload-to-cloud.service';
import { UpdateProductDto } from './dto/updatedProduct.dto';
import { type ProductFiles } from 'src/common/Types/index.type';
import { CompanyService } from '../company/company.service';
import { InventoryService } from '../inventory/inventory.service';
import { warehouse } from 'src/drizzle/schema';

@Injectable()
export class ProductsService {
  constructor(
    @Inject(DRIZZLE) readonly db: DrizzleService,
    @Inject(UploadToCloudService)
    private uploadToCloudService: UploadToCloudService,
    private inventoryService: InventoryService,
    private readonly companyService: CompanyService,
  ) {}

  async getAllProducts(domain: string) {
    try {
      console.log('companyId', domain);
      const companyId = await this.companyService.find(domain);
      const product = await this.db.query.products.findMany({
        where: (products) => eq(products.company_id, companyId),
        with: {
          variants: {
            limit: 1,
            orderBy: (variants, { desc }) => desc(variants.created_at),
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
                columns: {
                  stock_quantity: true,
                  warehouse_id: true,
                },
              },
            },
          },
        },
      });
      console.log('response product ', product);
      return product;
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch products', {
        cause: error,
      });
    }
  }
  async getProductMainDetails(productId: string, domain: string) {
    try {
      console.log(productId);
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
    try {
      console.log(productId);
      const product = await this.db.query.products
        .findFirst({
          where: eq(products.id, productId),
          with: {
            variants: {
              with: {
                images: true,
                inventory: true,
                reviews: true,
              },
            },
          },
        })
        .then((res) => {
          // console.log(res);
          return res;
        })
        .catch((error) => {
          console.error('Error fetching product by ID:', error);
          throw new InternalServerErrorException('Failed to fetch product', {
            cause: error,
          });
        });
      if (!product) {
        throw new HttpException('Product not found', HttpStatus.NOT_FOUND);
      }

      return product;
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

  async createProduct(
    productDto: CreateProductDto,
    vendorId: string,
    domain: string,
    files?: ProductFiles,
  ) {
    console.log('productDto', productDto);
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
    console.log('domain', domain);
    try {
      const companyId = await this.companyService.find(domain);

      return await this.db.transaction(async (tx) => {
        console.log('productDto.category_id', productDto.category_id);
        console.log('productDto.name', productDto.name);
        const categoryRecord = await tx
          .select({ id: categories.id })
          .from(categories)
          .where(eq(categories.id, productDto.category_id));
        console.log('categoryRecord', categoryRecord);
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
        console.log('productInsert', productInsert);
        const [createdProduct] = await tx
          .insert(products)
          .values(productInsert)
          .returning({ id: products.id });

        console.log('createdProduct', createdProduct);
        const [variantRecords] = await tx
          .insert(product_variants)
          .values({
            variant_name: productDto.variant_name || productDto.name,
            sku: productDto.sku,
            price: productDto.price || productDto.base_price.toString(),
            attributes: productDto.attributes,
            status: productDto.status,

            seo_meta: productDto.seo_meta ?? null,
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
    productVariantId: string,
    product: UpdateProductDto,
    imagesToDelete?: string[],
    files?: ProductFiles,
  ) {
    console.log('updateProduct productVariantId', productVariantId);
    console.log('product', product);
    console.log('imagesToDelete', imagesToDelete);
    if (!productVariantId) {
      return new HttpException(
        'Product Variant ID is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    const companyId = await this.companyService.find(productVariantId);
    const [productId] = await this.db
      .select({
        product_id: product_variants.product_id,
      })
      .from(product_variants)
      .where(eq(product_variants.id, productVariantId))
      .then((res) => {
        console.log('productId', res);
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
      await this.db.transaction(async (tx) => {
        const updatedProductResult = await tx
          .update(products)
          .set(productUpdatedData)
          .where(eq(products.id, productVariantId));
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
      });
    } catch (error) {
      throw new InternalServerErrorException('Failed to register vendor', {
        cause: error,
      });
    }
  }

  async deleteProduct(productId: string) {
    if (!productId) {
      return new HttpException(
        'Product ID is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      console.log('deleting product', productId);
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
    if (!categoryId && !productId) {
      return new HttpException(
        'Category ID is required',
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
        'Failed to update product category',
        {
          cause: error,
        },
      );
    }
  }
  async UpdateProductStatus(status: ProductStatus, productId: string) {
    if (!status) {
      return new HttpException(
        'Product status is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      await this.db
        .update(products)
        .set({ status })
        .where(eq(products.id, productId));
      return {
        message: 'Product status updated successfully',
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
  async deleteSelectedProducts(productIds: string[]) {
    if (!productIds || productIds.length === 0) {
      return new HttpException(
        'Product IDs are required',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
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
    if (!variantId) {
      return new HttpException(
        'Variant ID is required',
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
        'Failed to delete product variant',
        {
          cause: error,
        },
      );
    }
  }
  async deleteSelectedProductVariants(variantIds: string[]) {
    if (!variantIds || variantIds.length === 0) {
      return new HttpException(
        'Variant IDs are required',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
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
    if (!imageId) {
      return new HttpException('Image ID is required', HttpStatus.BAD_REQUEST);
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
      throw new InternalServerErrorException('Failed to delete product image', {
        cause: error,
      });
    }
  }
}
