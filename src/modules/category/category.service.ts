import {
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { CreateCategoryDto } from './dto/CreateCategory.dto';
import { DRIZZLE } from '../../drizzle/drizzle.module';

import { categories } from '../../drizzle/schema';
import { and, eq } from 'drizzle-orm';
import { type DrizzleService } from '../../drizzle/drizzle.module';
import { CompanyService } from '../company/company.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { CategoryErrorKeyEnum } from './constants/category.enums';
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
      const allCategories = await this.db.query.categories.findMany({
        where: eq(categories.company_id, companyId),
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
        const imageUrl = category.products?.[0]?.variants?.[0]?.images?.[0]?.image_url || null;
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
      throw new InternalServerErrorException(CategoryErrorKeyEnum.FAILED_TO_FETCH_CATEGORIES, {
        cause: error,
      });
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
        const imageUrl = category.products?.[0]?.variants?.[0]?.images?.[0]?.image_url || null;
        return {
          id: category.id,
          name: category.name,
          product_image: imageUrl,
        };
      });
    } catch (error) {
      throw new InternalServerErrorException(CategoryErrorKeyEnum.FAILED_TO_FETCH_HOMEPAGE_CATEGORIES, { cause: error });
    }
  }

  async create(createCategoryDto: CreateCategoryDto, domain: string) {
    const companyId = await this.resolveCompanyId(domain);
    if (!companyId) {
      throw new InternalServerErrorException(
        `Company not found for domain: ${domain}`,
      );
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
      throw new InternalServerErrorException(CategoryErrorKeyEnum.FAILED_TO_CREATE_CATEGORY, {
        cause: error,
      });
    }
  }
  async createMany(
    createCategoryDto: CreateCategoryDto[],

    domain: string,
  ) {
    const companyId = await this.resolveCompanyId(domain);
    if (!companyId) {
      throw new InternalServerErrorException(
        `Company not found for domain: ${domain}`,
      );
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
      throw new InternalServerErrorException(CategoryErrorKeyEnum.FAILED_TO_CREATE_CATEGORIES, {
        cause: error,
      });
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
    updateCategoryDto: CreateCategoryDto,
  ) {
    const companyId = await this.resolveCompanyId(domain);
    if (!companyId) {
      throw new InternalServerErrorException(
        `Company not found for domain: ${domain}`,
      );
    }
    try {
      await this.db
        .update(categories)
        .set({
          name: updateCategoryDto.name,
          description: updateCategoryDto.description,
          parent_id: updateCategoryDto.parent_id || null,
        })
        .where(
          and(eq(categories.id, id), eq(categories.company_id, companyId)),
        );
      return {
        message: 'Category updated successfully',
        status: HttpStatus.OK,
      };
    } catch (error) {
      throw new InternalServerErrorException(CategoryErrorKeyEnum.FAILED_TO_UPDATE_CATEGORY, {
        cause: error,
      });
    }
  }
  async delete(id: string, domain: string) {
    const companyId = await this.resolveCompanyId(domain);
    if (!companyId) {
      throw new InternalServerErrorException(
        `Company not found for domain: ${domain}`,
      );
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
      throw new InternalServerErrorException(CategoryErrorKeyEnum.FAILED_TO_DELETE_CATEGORY, {
        cause: error,
      });
    }
  }
}
