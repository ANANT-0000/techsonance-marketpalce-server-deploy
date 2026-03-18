import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE } from 'src/drizzle/drizzle.module';
import { type DrizzleDB } from 'src/drizzle/types/drizzle';
import {
  CategoryDto,
  CreateProductDto,
  type VariantDto,
} from './dto/createProduct.dto';
import {
  categories,
  product_images,
  product_variants,
  products,
} from 'src/drizzle/schema/shop.schema';
import { productImageType, ProductStatus } from 'src/drizzle/types/types';
import { eq } from 'drizzle-orm';
import { UploadMediaService } from 'src/utils/upload-media/upload-media.service';
import { ProductFiles } from './products.controller';
@Injectable()
export class ProductsService {
  constructor(
    @Inject(DRIZZLE) readonly db: DrizzleDB,
    @Inject(UploadMediaService) private uploadMediaService: UploadMediaService,
  ) {}
  async getAllProducts() {
    const [product] = await this.db
      .select()
      .from(products)
      .innerJoin(product_images, eq(products.id, product_images.product_id));
    return product;
  }
  async getProductById(productId: string) {
    const [product] = await this.db
      .select()
      .from(products)
      .innerJoin(product_images, eq(products.id, product_images.product_id))
      .innerJoin(product_variants, eq(products.id, product_variants.product_id))
      .where(eq(products.id, productId));
    return {
      product: product.products,
      images: product.product_images,
      variants: product.product_variants,
    };
  }

  async createProduct(
    productDto: CreateProductDto,
    vendorId: string,
    companyId: string,
    files?: ProductFiles,
  ) {
    // Step 1: Upload files OUTSIDE the transaction
    const finalResults: { url: string; type: productImageType }[] = [];

    if (files?.product?.[0]) {
      const mainRes = await this.uploadMediaService.uploadFile(
        files.product[0],
      );
      finalResults.push({
        url: mainRes.secure_url,
        type: productImageType.MAIN,
      });
    }

    if (files?.productSpec && files.productSpec.length > 0) {
      const galleryRes = await this.uploadMediaService.uploadFiles(
        files.productSpec,
      );
      finalResults.push(
        ...galleryRes.map((res) => ({
          url: res.secure_url,
          type: productImageType.GALLERY,
        })),
      );
    }

    // Step 2: DB transaction with pre-resolved URLs
    try {
      return await this.db.transaction(async (tx) => {
        const categoryRecord = await tx
          .select({ id: categories.id })
          .from(categories)
          .where(eq(categories.name, productDto.category.name))
          .limit(1);

        if (!categoryRecord.length) {
          throw new Error('Category not found');
        }
        const productInsert = {
          name: productDto.name,
          description: productDto.description,
          base_price: productDto.base_price.toString(), // decimal → string
          discount_percent: (productDto.discount_percent || 0).toString(),
          stock_quantity: productDto.has_variants
            ? 0
            : productDto.stock_quantity,
          status: productDto.status,
          features: productDto.features,
          has_variants: productDto.has_variants || false,
          category_id: productDto.category.id,
          vendor_id: vendorId,
          company_id: companyId,
        };
        const [createdProduct] = await tx
          .insert(products)
          .values(productInsert)
          .returning();

        if (
          productDto.has_variants &&
          productDto.variants !== undefined &&
          productDto.variants.length > 0
        ) {
          const variantInserts = productDto.variants.map(
            (variant: VariantDto) => ({
              variant_name: variant.variant_name,
              sku: variant.sku,
              price: variant.price.toString(),
              attributes: variant.attributes,
              stock_quantity: variant.stock_quantity,
              product_id: createdProduct.id,
            }),
          );
          await tx.insert(product_variants).values(variantInserts);
        }

        if (finalResults.length > 0) {
          const imageInserts = finalResults.map((image, index) => ({
            product_id: createdProduct.id,
            image_url: image.url,
            alt_text: `${image.type} Image ${index + 1}`,
            is_primary: index === 0,
            type: image.type,
          }));
          await tx.insert(product_images).values(imageInserts);
        }

        return { message: 'Product created successfully', status: 201 };
      });
    } catch (error) {
      throw new Error('Failed to create product', { cause: error });
    }
  }
  async updateProduct(
    productId: string,
    product: Partial<CreateProductDto>,
    variants?: Partial<VariantDto>,
    files?: ProductFiles,
  ) {
    try {
      if (product) {
        await this.db
          .update(products)
          .set(product)
          .where(eq(products.id, productId));
      }
      if (variants) {
        await this.db
          .update(product_variants)
          .set(variants)
          .where(eq(product_variants.product_id, productId));
      }
      const finalResults: { url: string; type: productImageType }[] = [];

      if (files?.product?.[0]) {
        const mainRes = await this.uploadMediaService.uploadFile(
          files.product[0],
        );
        finalResults.push({
          url: mainRes.secure_url,
          type: productImageType.MAIN,
        });
      }

      if (files?.productSpec && files.productSpec.length > 0) {
        const galleryRes = await this.uploadMediaService.uploadFiles(
          files.productSpec,
        );
        finalResults.push(
          ...galleryRes.map((res) => ({
            url: res.secure_url,
            type: productImageType.GALLERY,
          })),
        );
      }
      if (finalResults.length > 0) {
        const imageInserts = finalResults.map((image, index) => ({
          product_id: productId,
          image_url: image.url,
          alt_text: `${image.type} Image ${index + 1}`,
          is_primary: image.type === productImageType.MAIN,
          type: image.type,
        }));
        await this.db.insert(product_images).values(imageInserts);
      }
      return { message: 'Product updated successfully', status: 200 };
    } catch (error) {
      throw new Error('Failed to update product', { cause: error });
    }
  }

  async deleteProduct(productId: string) {
    await this.db.delete(products).where(eq(products.id, productId));
    return {
      message: 'Product deleted successfully',
      status: 200,
    };
  }
  async UpdateProductCategory(categoryId: string, productId: string) {
    await this.db
      .update(products)
      .set({ category_id: categoryId })
      .where(eq(products.id, productId));
    return {
      message: 'Product category updated successfully',
      status: 200,
    };
  }
  async UpdateProductStatus(status: ProductStatus, productId: string) {
    await this.db
      .update(products)
      .set({ status })
      .where(eq(products.id, productId));
    return {
      message: 'Product status updated successfully',
      status: 200,
    };
  }
  async deleteSelectedProducts(productIds: string[]) {
    const deletePromises = productIds.map((id) =>
      this.db.delete(products).where(eq(products.id, id)),
    );
    await Promise.all(deletePromises);
    return {
      message: 'Selected products deleted successfully',
      status: 200,
    };
  }
  async deleteProductVariant(variantId: string) {
    await this.db
      .delete(product_variants)
      .where(eq(product_variants.id, variantId));
    return {
      message: 'Product variant deleted successfully',
      status: 200,
    };
  }
  async deleteProductImage(imageId: string) {
    await this.db.delete(product_images).where(eq(product_images.id, imageId));
    return {
      message: 'Product image deleted successfully',
      status: 200,
    };
  }

  qtyUpdate(productId: string, quantity: number) {
    return this.db
      .update(products)
      .set({
        stock_quantity: quantity,
      })
      .where(eq(products.id, productId));
  }
}
