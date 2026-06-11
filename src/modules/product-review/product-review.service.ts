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
import { ProductReviewErrorKeyEnum } from './constants/product-review.enums';
@Injectable()
export class ProductReviewService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
  ) {}

  private async resolveCompanyId(domain: string): Promise<string> {
    const filteredDomain = domainExtractor(domain);
    return this.companyService.find(filteredDomain);
  }

  async create(dto: CreateProductReviewDto, userId: string, domain: string) {
    const companyId = await this.resolveCompanyId(domain);
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
        throw new InternalServerErrorException(
          ProductReviewErrorKeyEnum.DATABASE_QUERY_FAILED_WHILE_CREATING_PRODUCT_REVIEW,
          { cause: error },
        );
      });

    return {
      message: 'Review created successfully',
      newReview,
    };
  }

  async findAll() {
    return await this.db.select().from(product_reviews);
  }

  async findAllByProductId(productId: string) {
    const variantIds = await this.db
      .select({ id: product_variants.id })
      .from(product_variants)
      .where(eq(product_variants.product_id, productId));
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

    return reviews;
  }
  async findExistingReview(userId: string, productVariantId: string) {
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
          throw new InternalServerErrorException(
            ProductReviewErrorKeyEnum.DATABASE_QUERY_FAILED_WHILE_CHECKING_FOR_EXISTING_REVIEW,
            { cause: error },
          );
        });
      return existingReview;
    } catch (error) {
      throw new InternalServerErrorException(
        ProductReviewErrorKeyEnum.ERROR_CHECKING_FOR_EXISTING_REVIEW,
        {
          cause: error,
        },
      );
    }
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
    if (!review) {
      throw new NotFoundException(ProductReviewErrorKeyEnum.REVIEW_NOT_FOUND);
    }
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
        ProductReviewErrorKeyEnum.YOU_CAN_ONLY_UPDATE_YOUR_OWN_REVIEWS_OR_THE_REVIEW_DOES_NOT_EXIST,
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
      throw new UnauthorizedException(ProductReviewErrorKeyEnum.YOU_CAN_ONLY_DELETE_YOUR_OWN_REVIEWS);
    }

    return { success: true, message: 'Product review removed successfully' };
  }
}
