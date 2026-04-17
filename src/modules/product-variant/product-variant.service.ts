import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { DRIZZLE, type DrizzleService } from 'src/drizzle/drizzle.module';
import { and, eq, inArray } from 'drizzle-orm';
import { product_images, product_variants, products } from 'src/drizzle/schema';
import { productImageType, ProductStatus } from 'src/drizzle/types/types';
import { UploadToCloudService } from 'src/utils/upload-to-cloud/upload-to-cloud.service';
import { ProductFiles } from 'src/common/Types/index.type';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
@Injectable()
export class ProductVariantService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly uploadToCloudService: UploadToCloudService,
  ) {}
  async create(
    createProductVariantDto: CreateProductVariantDto,
    files: {
      product?: Express.Multer.File;
      product_spec?: Express.Multer.File[];
    },
  ) {
    if (!createProductVariantDto.product_id) {
      throw new InternalServerErrorException('Product ID is required');
    }
    const [productId] = await this.db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, createProductVariantDto.product_id));
    const variantData = {
      variant_name: createProductVariantDto.variant_name,
      sku: createProductVariantDto.sku,
      price: createProductVariantDto.price,
      attributes: createProductVariantDto.attributes,
      status: createProductVariantDto.status,
      stock_quantity: createProductVariantDto.stock_quantity,
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
          });
        console.log('variantRecord', variantRecord);
        if (!variantRecord) {
          console.log('failed to create variant ', variantRecord);
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
        console.log('finalResults images *******');

        console.table(finalResults);
        if (!variantRecord.id) {
          console.log('failed variant record:', variantRecord);
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
            .returning();
          console.log('variantImgsResult', variantImgsResult);
        }
        return variantRecord;
      });
      console.log('productVariantRecord', productVariantRecord);
    } catch (error) {
      console.error('Error creating product variant:', error);
      throw new InternalServerErrorException(
        'Failed to create product variant',
      );
    }
  }
  async findAllVariantsByProductId(productId: string) {
    try {
      console.log(productId);
      const productVariants = await this.db.query.product_variants.findMany({
        where: (product_variants) => eq(product_variants.product_id, productId),
        with: {
          images: true,
        },
      });
      return productVariants;
    } catch (error) {
      console.error('Error fetching product variants by product ID:', error);
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
          stock_quantity: product_variants.stock_quantity,
        })
        .from(product_variants)
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
      console.log('sending product varint details', productVariant);
      return productVariant;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error('Error fetching product variant details:', error);
      throw new InternalServerErrorException(
        'Failed to fetch product variant details',
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
        },
      });
      return productVariants;
    } catch (error) {
      console.error('Error fetching product variants:', error);
      throw new InternalServerErrorException(
        'Failed to fetch product variants',
      );
    }
  }
  async findOne(id: string) {
    try {
      const productVariant = await this.db.query.product_variants.findMany({
        where: (product_variants) => eq(product_variants.id, id),
        with: {
          images: true,
        },
      });
      if (!productVariant || productVariant.length === 0) {
        throw new Error(`Product variant with ID ${id} not found`);
      }
      return productVariant;
    } catch (error) {
      console.error('Error fetching product variant:', error);
      throw new InternalServerErrorException('Failed to fetch product variant');
    }
  }

  async update(
    id: string,
    updateProductVariantDto: UpdateProductVariantDto,
    imagesToDelete?: string[],
    files?: ProductFiles,
  ) {
    const updateData: Partial<UpdateProductVariantDto> = {
      variant_name: updateProductVariantDto.variant_name,
      sku: updateProductVariantDto.sku,
      price: updateProductVariantDto.price,
      attributes: updateProductVariantDto.attributes,
      status: updateProductVariantDto.status,
      stock_quantity: updateProductVariantDto.stock_quantity,
      seo_meta: updateProductVariantDto.seo_meta ?? null,
    };

    try {
      const result = await this.db.transaction(async (tx) => {
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
              console.log('existing variant id is null', existingVariant);
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

        return { ...existingVariant, ...updateData };
      });

      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      console.error('Update Error:', error);
      throw new InternalServerErrorException(
        'Failed to update product variant',
      );
    }
  }

  async delete(id: string) {
    try {
      if (!id) throw new HttpException('id required', HttpStatus.BAD_REQUEST);
      const result = await this.db
        .delete(product_variants)
        .where(eq(product_variants.id, id));
      if (!result) {
        throw new Error(`Product variant with ID ${id} not found`);
      }
      console.log('varint delete result', result);
      return result;
    } catch (error) {
      console.error('Error deleting product variant:', error);
      throw new InternalServerErrorException(
        'Failed to delete product variant',
      );
    }
  }
}
