// ../../modules/product-review/product-review.service.ts
import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateProductReviewDto } from './dto/create-product-review.dto';
import { UpdateProductReviewDto } from './dto/update-product-review.dto';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import { product_reviews, product_variants } from '../../drizzle/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { CompanyService } from '../company/company.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { or } from 'drizzle-orm';
@Injectable()
export class ProductReviewService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
  ) {}

  private async resolveCompanyId(domain: string): Promise<string> {
    console.log(
      `[ProductReviewService.resolveCompanyId] Resolving company for domain: ${domain}`,
    );
    const filteredDomain = domainExtractor(domain);
    return this.companyService.find(filteredDomain);
  }

  async create(dto: CreateProductReviewDto, userId: string, domain: string) {
    console.log('[ProductReviewService.create] Request received', {
      userId,
      domain,
    });
    console.log('[ProductReviewService.create] Resolving company id');
    const companyId = await this.resolveCompanyId(domain);
    console.log(
      '[ProductReviewService.create] Inserting new product review into DB',
      { companyId },
    );
    const [newReview] = await this.db
      .insert(product_reviews)
      .values({
        ...dto,
        user_id: userId,
        company_id: companyId,
      })
      .returning()
      .onConflictDoUpdate({
        target: [product_reviews.user_id, product_reviews.product_variant_id],
        set: {
          rating: dto.rating,
          review: dto.review,
        },
      })
      .catch((error) => {
        console.error(
          '[ProductReviewService.create] Drizzle query error:',
          error,
        );
        throw new InternalServerErrorException(
          'Database query failed while creating product review',
          { cause: error },
        );
      });

    console.log('[ProductReviewService.create] Review created successfully');
    return {
      message: 'Review created successfully',
      newReview,
    };
  }

  async findAll() {
    console.log('[ProductReviewService.findAll] Request received');
    return await this.db.select().from(product_reviews);
  }

  async findAllByProductId(productId: string) {
    console.log(
      '[ProductReviewService.findAllByProductId] Request received for product:',
      productId,
    );
    console.log(
      '[ProductReviewService.findAllByProductId] Querying product variant from DB',
    );
    const variantIds = await this.db
      .select({ id: product_variants.id })
      .from(product_variants)
      .where(eq(product_variants.product_id, productId));
    console.log(
      '[ProductReviewService.findAllByProductId] Querying product reviews from DB',
    );
    const variantIdArray = variantIds.map((v) => v.id);

    // 2. SAFETY CHECK: Prevent Drizzle crash if the array is empty
    if (variantIdArray.length === 0) {
      return []; // If there are no variants, there are definitely no reviews.
    }
    const reviews = await this.db.query.product_reviews.findMany({
      where: inArray(product_reviews.product_variant_id, variantIdArray),
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

    console.log('[ProductReviewService.findAllByProductId] Returning reviews');
    return reviews;
  }
  async findExistingReview(userId: string, productVariantId: string) {
    console.log(
      '[ProductReviewService.findExistingReview] Checking for existing review for user:',
      userId,
      'and product variant:',
      productVariantId,
    );
    try {
      const [existingReview] = await this.db
        .select()
        .from(product_reviews)
        .where(
          and(
            eq(product_reviews.user_id, userId),
            eq(product_reviews.product_variant_id, productVariantId),
          ),
        )
        .catch((error) => {
          console.error(
            '[ProductReviewService.findExistingReview] Drizzle query error:',
            error,
          );
          throw new InternalServerErrorException(
            'Database query failed while checking for existing review',
            { cause: error },
          );
        });
      console.log(
        '[ProductReviewService.findExistingReview] Existing review found:',
        existingReview,
      );
      return existingReview;
    } catch (error) {
      console.error(
        '[ProductReviewService.findExistingReview] Error checking for existing review:',
        error,
      );
      throw new InternalServerErrorException(
        'Error checking for existing review',
        {
          cause: error,
        },
      );
    }
  }
  async findOneById(id: string) {
    console.log(
      '[ProductReviewService.findOneById] Request received for id:',
      id,
    );
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
    if (!review) {
      console.log(
        '[ProductReviewService.findOneById] Stopping: Review not found',
      );
      throw new NotFoundException('Review not found');
    }
    console.log('[ProductReviewService.findOneById] Review found');
    return review;
  }

  async update(
    id: string,
    userId: string,
    updateProductReviewDto: UpdateProductReviewDto,
  ) {
    console.log('[ProductReviewService.update] Request received', {
      id,
      userId,
    });
    console.log('[ProductReviewService.update] Updating product review in DB');
    const [updatedReview] = await this.db
      .update(product_reviews)
      .set({ ...updateProductReviewDto })
      .where(
        and(eq(product_reviews.id, id), eq(product_reviews.user_id, userId)),
      )
      .returning();

    if (!updatedReview) {
      console.log(
        '[ProductReviewService.update] Stopping: Unauthorized or review not found',
      );
      throw new UnauthorizedException(
        'You can only update your own reviews, or the review does not exist.',
      );
    }

    console.log('[ProductReviewService.update] Review updated successfully');
    return { success: true, message: 'Review updated', data: updatedReview };
  }

  async remove(id: string, userId: string) {
    console.log('[ProductReviewService.remove] Request received', {
      id,
      userId,
    });
    console.log('[ProductReviewService.remove] Deleting review from DB');
    const [deletedReview] = await this.db
      .delete(product_reviews)
      .where(
        and(eq(product_reviews.id, id), eq(product_reviews.user_id, userId)),
      )
      .returning();

    if (!deletedReview) {
      console.log(
        '[ProductReviewService.remove] Stopping: Unauthorized or review not found',
      );
      throw new UnauthorizedException('You can only delete your own reviews.');
    }

    console.log('[ProductReviewService.remove] Review deleted successfully');
    return { success: true, message: 'Product review removed successfully' };
  }
}
