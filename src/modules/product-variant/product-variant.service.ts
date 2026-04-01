import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { DRIZZLE, type DrizzleService } from 'src/drizzle/drizzle.module';
import { eq, inArray } from 'drizzle-orm';
import { product_images, product_variants, products } from 'src/drizzle/schema';
import { productImageType } from 'src/drizzle/types/types';
import { UploadToCloudService } from 'src/utils/upload-to-cloud/upload-to-cloud.service';
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
          const imageInserts = finalResults.map((image, index) => ({
            product_id: productId.id,
            variant_id: variantRecord.id,
            image_url: `${image.url}`,
            alt_text: `${image.type} Image ${index + 1}`,
            is_primary: image.type === productImageType.MAIN,
            imgType: image.type,
          }));

          await this.db.insert(product_images).values(imageInserts);
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

  async findAll(vendorId: string) {
    try {
      const product = await this.db
        .select({ id: products.id, has_variants: products.has_variants })
        .from(products)
        .where(eq(products.vendor_id, vendorId));
      if (product.length === 0) {
        return [];
      }
      if (product[0].has_variants === false) {
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

  // async update(
  //   id: string,
  //   updateProductVariantDto: any,
  //   files: Express.Multer.File[],
  // ) {
  //   const updatedProductVariant = await this.db.transaction(async (tx) => {
  //     const productVariant = await tx.query.product_variants.findFirst({
  //       where: (product_variants) => eq(product_variants.id, id),
  //     });
  //     if (!productVariant) {
  //       throw new Error(`Product variant with ID ${id} not found`);
  //     }
  //     const updatedProductVariantRecord = await tx
  //       .update(product_variants)
  //       .set({
  //         variant_name: updateProductVariantDto.variant_name,
  //         sku: updateProductVariantDto.sku,
  //         price: updateProductVariantDto.price,
  //         attributes: updateProductVariantDto.attributes,
  //         status: updateProductVariantDto.status,
  //         stock_quantity: updateProductVariantDto.stock_quantity,
  //         seo_meta: updateProductVariantDto.seo_meta,
  //       })
  //       .where(eq(product_variants.id, id));
  //     await tx.delete(product_images).where(eq(product_images.product_id, id));
  //      const finalResults: { url: string; type: productImageType }[] = [];

  //           if (files?.product?.[0]) {
  //             const mainRes = await this.uploadToCloudService.uploadFile(
  //               files.product[0],
  //             );
  //             finalResults.push({
  //               url: mainRes.secure_url,
  //               type: productImageType.MAIN,
  //             });
  //           }

  //           if (files?.product_spec && files.product_spec.length > 0) {
  //             const galleryRes = await this.uploadToCloudService.uploadFiles(
  //               files.product_spec,
  //             );
  //             finalResults.push(
  //               ...galleryRes.map((res) => ({
  //                 url: res.secure_url,
  //                 type: productImageType.GALLERY,
  //               })),
  //             );
  //           }
  //           console.log('finalResults *******');
  //           console.table(finalResults);
  //           if (finalResults.length > 0) {
  //             const imageInserts = finalResults.map((image, index) => ({
  //               product_id: productId,
  //               image_url: image.url,
  //               alt_text: `${image.type} Image ${index + 1}`,
  //               is_primary: image.type === productImageType.MAIN,
  //               imgType: image.type,
  //             }));
  //             await this.db.insert(product_images).values(imageInserts);

  //     return productVariant;
  //   });
  // }

  async delete(id: string) {
    try {
      const result = await this.db
        .delete(product_variants)
        .where(eq(product_variants.id, id));
      if (!result) {
        throw new Error(`Product variant with ID ${id} not found`);
      }
      return result;
    } catch (error) {
      console.error('Error deleting product variant:', error);
      throw new InternalServerErrorException(
        'Failed to delete product variant',
      );
    }
  }
}
