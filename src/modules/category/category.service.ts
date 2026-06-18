import {
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { CreateCategoryDto } from './dto/CreateCategory.dto';
import { UpdateCategoryDto } from './dto/UpdateCategory.dto';
import { DRIZZLE } from '../../drizzle/drizzle.module';
import { categories, products } from '../../drizzle/schema';
import { and, eq, or, ilike, inArray, desc, asc, sql, SQL } from 'drizzle-orm';
import { type DrizzleService } from '../../drizzle/drizzle.module';
import { CompanyService } from '../company/company.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { CategoryErrorKeyEnum } from './constants/category.enums';
import { HttpExceptionFilter } from 'src/common/filters/http-exception.filter';

@Injectable()
export class CategoryService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly CompanyService: CompanyService,
  ) {}

  private async resolveCompanyId(domain: string): Promise<string> {
    const filterDomain = domainExtractor(domain);
    return this.CompanyService.find(filterDomain);
  }

  private async validateParentCategory(
    parentId: string,
    companyId: string,
    categoryIdToExclude?: string,
  ) {
    if (parentId === categoryIdToExclude) {
      throw new BadRequestException(CategoryErrorKeyEnum.PARENT_CANNOT_BE_SELF);
    }

    const parent = await this.db
      .select()
      .from(categories)
      .where(
        and(eq(categories.id, parentId), eq(categories.company_id, companyId)),
      )
      .limit(1);

    if (parent.length === 0) {
      throw new BadRequestException(
        CategoryErrorKeyEnum.PARENT_CATEGORY_NOT_FOUND,
      );
    }

    // Rule: Parent category cannot itself be a subcategory (no multi-level nesting)
    if (parent[0].parent_id) {
      throw new BadRequestException(
        CategoryErrorKeyEnum.PARENT_HAS_SUB_CATEGORIES,
      );
    }
  }

  async findAll(
    domain: string,
    filters?: {
      search: string;
      limit: number;
      offset: number;
      status: string | undefined;
      date: string;
      sortby: string;
    },
  ) {
    const companyId = await this.resolveCompanyId(domain);
    try {
      const conditions: SQL[] = [eq(categories.company_id, companyId)];

      if (filters?.search) {
        const searchPattern = `%${filters.search.toLowerCase()}%`;
        const searchCondition = or(
          ilike(categories.name, searchPattern),
          ilike(categories.description, searchPattern),
        );
        if (searchCondition) {
          conditions.push(searchCondition);
        }
      }

      const orderBy =
        filters?.sortby === 'asc'
          ? asc(categories.name)
          : desc(categories.created_at);

      const allCategories = await this.db.query.categories.findMany({
        where: and(...conditions),
        orderBy: orderBy,
        limit: filters?.limit ?? 20,
        offset: filters?.offset ?? 0,
        with: {
          products: {
            limit: 1,
            with: {
              variants: {
                limit: 1,
                with: {
                  images: {
                    limit: 1,
                    where: (img) => eq(img.is_primary, true),
                  },
                },
              },
            },
          },
        },
      });

      return allCategories.map((category: any) => {
        const imageUrl =
          category.products?.[0]?.variants?.[0]?.images?.[0]?.image_url || null;
        return {
          id: category.id,
          name: category.name,
          description: category.description,
          parent_id: category.parent_id,
          company_id: category.company_id,
          created_at: category.created_at,
          updated_at: category.updated_at,
          product_image: imageUrl,
        };
      });
    } catch (error) {
      if (
        error instanceof HttpExceptionFilter ||
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        CategoryErrorKeyEnum.FAILED_TO_FETCH_CATEGORIES,
        {
          cause: error,
        },
      );
    }
  }

  async getHomepageCategories(domain: string, limit: number = 8) {
    const companyId = await this.resolveCompanyId(domain);
    try {
      const allCategories = await this.db.query.categories.findMany({
        where: eq(categories.company_id, companyId),
        limit: limit,
        with: {
          products: {
            limit: 1,
            with: {
              variants: {
                limit: 1,
                with: {
                  images: {
                    limit: 1,
                    where: (img) => eq(img.is_primary, true),
                  },
                },
              },
            },
          },
        },
      });

      return allCategories.map((category: any) => {
        const imageUrl =
          category.products?.[0]?.variants?.[0]?.images?.[0]?.image_url || null;
        return {
          id: category.id,
          name: category.name,
          product_image: imageUrl,
        };
      });
    } catch (error) {
      throw new InternalServerErrorException(
        CategoryErrorKeyEnum.FAILED_TO_FETCH_HOMEPAGE_CATEGORIES,
        { cause: error },
      );
    }
  }

  async create(createCategoryDto: CreateCategoryDto, domain: string) {
    const companyId = await this.resolveCompanyId(domain);
    if (!companyId) {
      throw new InternalServerErrorException(
        `Company not found for domain: ${domain}`,
      );
    }

    if (createCategoryDto.parent_id) {
      await this.validateParentCategory(createCategoryDto.parent_id, companyId);
    }

    try {
      await this.db.insert(categories).values({
        name: createCategoryDto.name,
        description: createCategoryDto.description,
        parent_id: createCategoryDto.parent_id || null,
        company_id: companyId || null,
      });
      return {
        message: 'Category created successfully',
        status: HttpStatus.CREATED,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        CategoryErrorKeyEnum.FAILED_TO_CREATE_CATEGORY,
        {
          cause: error,
        },
      );
    }
  }

  async createMany(createCategoryDto: CreateCategoryDto[], domain: string) {
    const companyId = await this.resolveCompanyId(domain);
    if (!companyId) {
      throw new InternalServerErrorException(
        `Company not found for domain: ${domain}`,
      );
    }

    // Validate parent category for each DTO in batch
    for (const dto of createCategoryDto) {
      if (dto.parent_id) {
        await this.validateParentCategory(dto.parent_id, companyId);
      }
    }

    try {
      const categoryValues = createCategoryDto.map((dto) => ({
        name: dto.name,
        description: dto.description,
        parent_id: dto.parent_id || null,
        company_id: companyId || null,
      }));
      await this.db.insert(categories).values(categoryValues);
      return {
        message: 'Categories created successfully',
        status: HttpStatus.CREATED,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        CategoryErrorKeyEnum.FAILED_TO_CREATE_CATEGORIES,
        {
          cause: error,
        },
      );
    }
  }

  async findOne(id: string, domain: string) {
    const companyId = await this.resolveCompanyId(domain);
    if (!companyId) {
      throw new InternalServerErrorException(
        `Company not found for domain: ${domain}`,
      );
    }

    const category = await this.db
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.company_id, companyId)));
    return category;
  }

  async update(
    id: string,
    domain: string,
    updateCategoryDto: UpdateCategoryDto,
  ) {
    const companyId = await this.resolveCompanyId(domain);
    if (!companyId) {
      throw new InternalServerErrorException(
        `Company not found for domain: ${domain}`,
      );
    }

    // 1. Verify target parent if parent_id is updated
    if (updateCategoryDto.parent_id) {
      await this.validateParentCategory(
        updateCategoryDto.parent_id,
        companyId,
        id,
      );

      // Demotion Check: If we are turning this category into a subcategory,
      // it must not contain any subcategories itself (preventing multi-level depth).
      const children = await this.db
        .select()
        .from(categories)
        .where(
          and(
            eq(categories.parent_id, id),
            eq(categories.company_id, companyId),
          ),
        )
        .limit(1);

      if (children.length > 0) {
        throw new BadRequestException(
          CategoryErrorKeyEnum.CATEGORY_HAS_SUB_CATEGORIES,
        );
      }
    }

    try {
      await this.db
        .update(categories)
        .set({
          name: updateCategoryDto.name,
          description: updateCategoryDto.description,
          parent_id:
            updateCategoryDto.parent_id === undefined
              ? undefined
              : updateCategoryDto.parent_id || null,
        })
        .where(
          and(eq(categories.id, id), eq(categories.company_id, companyId)),
        );
      return {
        message: 'Category updated successfully',
        status: HttpStatus.OK,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        CategoryErrorKeyEnum.FAILED_TO_UPDATE_CATEGORY,
        {
          cause: error,
        },
      );
    }
  }

  async delete(id: string, domain: string) {
    const companyId = await this.resolveCompanyId(domain);
    if (!companyId) {
      throw new InternalServerErrorException(
        `Company not found for domain: ${domain}`,
      );
    }

    // 1. Fetch subcategories to verify cascade safety
    const subs = await this.db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(eq(categories.parent_id, id), eq(categories.company_id, companyId)),
      );

    const allCategoryIds = [id, ...subs.map((s) => s.id)];

    // 2. Cascade Prevention Check: If products are linked to any category in the chain, prevent deletion
    const linkedProducts = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(products)
      .where(
        and(
          inArray(products.category_id, allCategoryIds),
          eq(products.company_id, companyId),
        ),
      );

    if (linkedProducts[0] && Number(linkedProducts[0].count) > 0) {
      throw new ConflictException(CategoryErrorKeyEnum.CATEGORY_HAS_PRODUCTS);
    }

    try {
      await this.db
        .delete(categories)
        .where(
          and(eq(categories.id, id), eq(categories.company_id, companyId)),
        );
      return {
        message: 'Category deleted successfully',
        status: HttpStatus.OK,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        CategoryErrorKeyEnum.FAILED_TO_DELETE_CATEGORY,
        {
          cause: error,
        },
      );
    }
  }
}
