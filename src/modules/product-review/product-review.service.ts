import { Inject, Injectable } from '@nestjs/common';
import { CreateProductReviewDto } from './dto/create-product-review.dto';
import { UpdateProductReviewDto } from './dto/update-product-review.dto';
import { type DrizzleDB } from 'src/drizzle/types/drizzle';
import { DRIZZLE } from 'src/drizzle/drizzle.module';
import { product_reviews, product_variants } from 'src/drizzle/schema';
import { eq } from 'drizzle-orm';

@Injectable()
export class ProductReviewService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}
  async create(createProductReviewDto: CreateProductReviewDto) {
    await this.db.insert(product_reviews).values(createProductReviewDto);
    return {
      message: 'Product review created successfully',
      data: createProductReviewDto,
    };
  }
  async findAll() {
    return await this.db.select().from(product_reviews);
  }

  async findAllByProductId(productId: string) {
    const reviews = await this.db
      .select()
      .from(product_reviews)
      .innerJoin(
        product_variants,
        eq(product_reviews.product_variant_id, product_variants.id),
      )
      .where(eq(product_variants.product_id, productId));
    return {
      message: 'Product reviews retrieved successfully',
      data: reviews,
    };
  }

  async findOneById(id: string) {
    const review = await this.db
      .select()
      .from(product_reviews)
      .where(eq(product_reviews.id, id))
      .innerJoin(
        product_variants,
        eq(product_reviews.product_variant_id, product_variants.id),
      );
    return {
      message: 'Product review retrieved successfully',
      data: review,
    };
  }

  async update(id: string, updateProductReviewDto: UpdateProductReviewDto) {
    await this.db
      .update(product_reviews)
      .set(updateProductReviewDto)
      .where(eq(product_reviews.id, id));
    return {
      message: 'Product review updated successfully',
      data: { ...updateProductReviewDto, id },
    };
  }

  async remove(id: string) {
    await this.db.delete(product_reviews).where(eq(product_reviews.id, id));
    return {
      message: 'Product review removed successfully',
    };
  }
}
