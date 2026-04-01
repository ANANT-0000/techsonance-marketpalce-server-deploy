import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { DRIZZLE, type DrizzleService } from 'src/drizzle/drizzle.module';
// import { type DrizzleDB } from 'src/drizzle/types/drizzle';
import { CreateProductDto } from './dto/createProduct.dto';
import {
  categories,
  product_images,
  product_variants,
  products,
} from 'src/drizzle/schema/shop.schema';
import { productImageType, ProductStatus } from 'src/drizzle/types/types';
import { and, eq } from 'drizzle-orm';

import { ProductFiles } from './products.controller';
import { UploadToCloudService } from 'src/utils/upload-to-cloud/upload-to-cloud.service';
@Injectable()
export class ProductsService {
  constructor(
    @Inject(DRIZZLE) readonly db: DrizzleService,
    @Inject(UploadToCloudService)
    private uploadToCloudService: UploadToCloudService,
  ) {}

  async getAllProducts() {
    try {
      const productsList = await this.db.select().from(products);
      const productsWithImages = await this.db.select().from(product_images);
      console.log('productsList', productsList);
      return {
        products: productsList,
        images: productsWithImages,
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch products', {
        cause: error,
      });
    }
  }
  async getProducts(vendorId: string) {
    try {
      console.log('vendorId', vendorId);
      const product = await this.db.query.products.findMany({
        where: (products) => eq(products.vendor_id, vendorId),
        with: {
          images: true,
          variants: true,
        },
      });
      console.log('response', product);

      return product;
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch products', {
        cause: error,
      });
    }
  }

  async getProductById(productId: string) {
    try {
      console.log(productId);
      const product = await this.db.query.products.findFirst({
        where: (products) => eq(products.id, productId),
        with: {
          images: true,
        },
      });
      if (!product) {
        throw new HttpException('Product not found', HttpStatus.NOT_FOUND);
      }
      if (product.has_variants) {
        const variants = await this.db.query.product_variants.findMany({
          where: (product_variants) =>
            eq(product_variants.product_id, productId),
          with: {
            images: true,
          },
        });
        console.log('variants', variants);
        return { ...product, variants };
      }
      console.log('product by id', product);
      return product;
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch product', {
        cause: error,
      });
    }
  }

  async createProduct(
    productDto: CreateProductDto,
    vendorId: string,
    companyId: string,
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

    try {
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
          stock_quantity: productDto.stock_quantity,
          status: productDto.status,
          features: productDto.features,
          has_variants: productDto.has_variants || false,
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
            stock_quantity: productDto.stock_quantity,
            seo_meta: productDto.seo_meta ?? null,
            product_id: createdProduct.id,
          })
          .returning({
            id: product_variants.id,
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

        return {
          message: 'Product created successfully',
          status: HttpStatus.CREATED,
        };
      });
    } catch (error) {
      throw new InternalServerErrorException('Failed to register vendor', {
        cause: error,
      });
    }
  }
  async updateProduct(
    productId: string,
    product: Partial<CreateProductDto>,
    files?: ProductFiles,
  ) {
    if (!productId) {
      return new HttpException(
        'Product ID is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      if (product) {
        await this.db
          .update(products)
          .set(product)
          .where(eq(products.id, productId));
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
      console.log('finalResults *******');
      console.table(finalResults);
      if (finalResults.length > 0) {
        const imageInserts = finalResults.map((image, index) => ({
          product_id: productId,
          image_url: image.url,
          alt_text: `${image.type} Image ${index + 1}`,
          is_primary: image.type === productImageType.MAIN,
          imgType: image.type,
        }));
        await this.db.insert(product_images).values(imageInserts);
      }
      return {
        message: 'Product updated successfully',
        status: HttpStatus.OK,
      };
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
      await this.db.delete(products).where(eq(products.id, productId));
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

  async qtyUpdate(productId: string, quantity: number) {
    if (!productId) {
      return new HttpException(
        'Product ID is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      const result = await this.db
        .update(products)
        .set({
          stock_quantity: quantity,
        })
        .where(eq(products.id, productId));
      console.log('qty result', result);
      return {
        message: 'Product quantity updated successfully',
        status: HttpStatus.OK,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to update product quantity',
        {
          cause: error,
        },
      );
    }
  }
}
