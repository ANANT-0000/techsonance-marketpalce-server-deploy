// src/modules/product-review/product-review.service.ts
import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateProductReviewDto } from './dto/create-product-review.dto';
import { UpdateProductReviewDto } from './dto/update-product-review.dto';
import { DRIZZLE, type DrizzleService } from 'src/drizzle/drizzle.module';
import { product_reviews, product_variants } from 'src/drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { CompanyService } from '../company/company.service';
@Injectable()
export class ProductReviewService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
  ) {}

  async create(
    createProductReviewDto: CreateProductReviewDto,
    userId: string,
    domain: string,
  ) {
    const companyId = await this.companyService.find(domain);
    const [newReview] = await this.db
      .insert(product_reviews)
      .values({
        ...createProductReviewDto,
        user_id: userId,
        company_id: companyId,
      })
      .returning();

    return {
      message: 'Review created successfully',
      newReview,
    };
  }

  async findAll() {
    return await this.db.select().from(product_reviews);
  }

  async findAllByProductId(productId: string) {
    const [variant] = await this.db
      .select({ id: product_variants.id })
      .from(product_variants)
      .where(eq(product_variants.product_id, productId))
      .limit(1);
    const reviews = await this.db.query.product_reviews.findMany({
      where: eq(product_reviews.product_variant_id, variant.id),
      with: {
        variant: {
          columns: {
            product_id: true,
          },
        },
        user: {
          columns: {
            first_name: true,
            last_name: true,
          },
        },
      },
    });

    return reviews;
  }

  async findOneById(id: string) {
    const review = await this.db.query.product_reviews.findMany({
      where: eq(product_reviews.id, id),
      with: {
        variant: {
          columns: {
            product_id: true,
          },
        },
        user: {
          columns: {
            first_name: true,
            last_name: true,
          },
        },
      },
    });
    if (!review) throw new NotFoundException('Review not found');
    return review;
  }

  async update(
    id: string,
    userId: string,
    updateProductReviewDto: UpdateProductReviewDto,
  ) {
    const [updatedReview] = await this.db
      .update(product_reviews)
      .set({ ...updateProductReviewDto })
      .where(
        and(eq(product_reviews.id, id), eq(product_reviews.user_id, userId)),
      )
      .returning();

    if (!updatedReview) {
      throw new UnauthorizedException(
        'You can only update your own reviews, or the review does not exist.',
      );
    }

    return { success: true, message: 'Review updated', data: updatedReview };
  }

  async remove(id: string, userId: string) {
    const [deletedReview] = await this.db
      .delete(product_reviews)
      .where(
        and(eq(product_reviews.id, id), eq(product_reviews.user_id, userId)),
      )
      .returning();

    if (!deletedReview) {
      throw new UnauthorizedException('You can only delete your own reviews.');
    }

    return { success: true, message: 'Product review removed successfully' };
  }
}
