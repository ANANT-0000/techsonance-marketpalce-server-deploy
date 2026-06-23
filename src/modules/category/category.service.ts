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
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';
import { EntityStatus } from '../../drizzle/types/types';

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

  // Replace validateParentCategory entirely — drop the depth restriction,
  // keep a cycle guard so reparenting can't create a loop in an n-level tree.
  private async validateParentCategory(
    parentId: string,
    companyId: string,
    categoryIdToExclude?: string,
  ) {
    if (parentId === categoryIdToExclude) {
      throw new BadRequestException(CategoryErrorKeyEnum.PARENT_CANNOT_BE_SELF);
    }

    const [parent] = await this.db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.id, parentId),
          eq(categories.company_id, companyId),
          // Soft-delete guard: treat deleted/inactive parents as non-existent
          eq(categories.record_status, EntityStatus.ACTIVE),
        ),
      )
      .limit(1);

    if (!parent) {
      throw new BadRequestException(
        CategoryErrorKeyEnum.PARENT_CATEGORY_NOT_FOUND,
      );
    }

    // n-level nesting is allowed now. Only guard against cycles when reparenting
    // an existing node (creation can never cycle, so categoryIdToExclude gates this).
    if (categoryIdToExclude) {
      let currentId: string | null = parentId;
      const seen = new Set<string>();
      while (currentId) {
        if (currentId === categoryIdToExclude) {
          throw new BadRequestException(
            CategoryErrorKeyEnum.CIRCULAR_REFERENCE,
          );
        }
        if (seen.has(currentId)) break;
        seen.add(currentId);
        const [row] = await this.db
          .select({ parent_id: categories.parent_id })
          .from(categories)
          .where(
            and(
              eq(categories.id, currentId),
              eq(categories.company_id, companyId),
            ),
          )
          .limit(1);
        currentId = row?.parent_id ?? null;
      }
    }
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private async generateUniqueSlug(
    name: string,
    companyId: string,
    excludeId?: string,
  ): Promise<string> {
    const base = this.slugify(name) || 'category';
    let slug = base;
    let suffix = 1;
    while (true) {
      const [conflict] = await this.db
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(eq(categories.slug, slug), eq(categories.company_id, companyId)),
        )
        .limit(1);
      if (!conflict || conflict.id === excludeId) return slug;
      slug = `${base}-${++suffix}`;
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
      const conditions: SQL[] = [
        eq(categories.company_id, companyId),
        // Soft-delete filter: only return active, non-deleted categories
        eq(categories.record_status, EntityStatus.ACTIVE),
      ];

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
          slug: category.slug,
          description: category.description,
          parent_id: category.parent_id,
          company_id: category.company_id,
          created_at: category.created_at,
          updated_at: category.updated_at,
          product_image: imageUrl,
          icon_url: category.icon_url,
          show_in_nav: category.show_in_nav,
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

      const mapped = allCategories.map((category: any) => {
        const imageUrl =
          category.icon_url ||
          category.products?.[0]?.variants?.[0]?.images?.[0]?.image_url ||
          null;
        return {
          id: category.id,
          name: category.name,
          product_image: imageUrl,
        };
      });

      // Filter out categories that do not have any image (icon_url or product image)
      const filtered = mapped.filter(
        (cat) => cat.product_image !== null && cat.product_image !== '',
      );

      return filtered.slice(0, limit);
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
      const slug = await this.generateUniqueSlug(
        createCategoryDto.name,
        companyId,
      );
      await this.db.insert(categories).values({
        name: createCategoryDto.name,
        slug,
        description: createCategoryDto.description,
        parent_id: createCategoryDto.parent_id || null,
        company_id: companyId,
        icon_url: createCategoryDto.icon_url || null,
        show_in_nav: createCategoryDto.show_in_nav ?? true,
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

  async findOne(categoryName: string, domain: string) {
    const companyId = await this.resolveCompanyId(domain);
    if (!companyId) {
      throw new InternalServerErrorException(
        `Company not found for domain: ${domain}`,
      );
    }

    const category = await this.db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.name, categoryName),
          eq(categories.company_id, companyId),
        ),
      )
      .catch((error) => {
        throw new InternalServerErrorException(
          CategoryErrorKeyEnum.FAILED_TO_FETCH_CATEGORIES,
          {
            cause: error,
          },
        );
      });
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
      // validateParentCategory walks the full ancestor chain — this covers cycle prevention
      await this.validateParentCategory(
        updateCategoryDto.parent_id,
        companyId,
        id,
      );
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
          icon_url:
            updateCategoryDto.icon_url === undefined
              ? undefined
              : updateCategoryDto.icon_url || null,
          show_in_nav:
            updateCategoryDto.show_in_nav === undefined
              ? undefined
              : updateCategoryDto.show_in_nav,
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
  private async collectDescendantIds(
    rootId: string,
    companyId: string,
  ): Promise<string[]> {
    const all: string[] = [];
    let frontier = [rootId];
    while (frontier.length) {
      const children = await this.db
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            inArray(categories.parent_id, frontier),
            eq(categories.company_id, companyId),
          ),
        );
      if (children.length === 0) break;
      const ids = children.map((c) => c.id);
      all.push(...ids);
      frontier = ids;
    }
    return all;
  }

  async delete(id: string, domain: string) {
    const companyId = await this.resolveCompanyId(domain);

    const descendantIds = await this.collectDescendantIds(id, companyId);
    const allCategoryIds = [id, ...descendantIds];

    await this.db
      .update(products)
      .set({ category_id: null })
      .where(
        and(
          inArray(products.category_id, allCategoryIds),
          eq(products.company_id, companyId),
        ),
      );

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
