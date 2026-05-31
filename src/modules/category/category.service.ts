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
@Injectable()
export class CategoryService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly CompanyService: CompanyService,
  ) {}
  private async resolveCompanyId(domain: string): Promise<string> {
    console.log(
      `[CategoryService.resolveCompanyId] Resolving company for domain: ${domain}`,
    );
    const filterDomain = domainExtractor(domain);
    console.log(
      `[CategoryService.resolveCompanyId] Extracted filter domain: ${filterDomain}`,
    );
    console.log(
      `[CategoryService.resolveCompanyId] Querying CompanyService.find(...)`,
    );
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
    console.log('[CategoryService.findAll] Request received', { domain });
    console.log('[CategoryService.findAll] Resolving company id');
    const companyId = await this.resolveCompanyId(domain);
    console.log(
      `[CategoryService.findAll] Querying categories for company_id: ${companyId}`,
    );
    const allCategories = await this.db
      .select()
      .from(categories)
      .where(eq(categories.company_id, companyId))
      .limit(filters?.limit ?? 10)
      .offset(filters?.offset ?? 0)
      .catch((error) => {
        console.error(
          `[CategoryService.findAll] Failed while fetching categories for companyId ${companyId}`,
          error,
        );
        throw new InternalServerErrorException('Failed to fetch categories', {
          cause: error,
        });
      });
    console.log(
      `[CategoryService.findAll] Retrieved ${allCategories.length} category record(s)`,
    );
    return allCategories;
  }

  async create(createCategoryDto: CreateCategoryDto, domain: string) {
    console.log('[CategoryService.create] Request received', {
      name: createCategoryDto.name,
      domain,
    });
    console.log('[CategoryService.create] Resolving company id');
    const companyId = await this.resolveCompanyId(domain);
    if (!companyId) {
      throw new InternalServerErrorException(
        `Company not found for domain: ${domain}`,
      );
    }
    try {
      console.log('[CategoryService.create] Inserting category record');
      await this.db.insert(categories).values({
        name: createCategoryDto.name,
        description: createCategoryDto.description,
        parent_id: createCategoryDto.parent_id || null,
        company_id: companyId || null,
      });
      console.log('[CategoryService.create] Category created successfully');
      return {
        message: 'Category created successfully',
        status: HttpStatus.CREATED,
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to create category', {
        cause: error,
      });
    }
  }
  async createMany(
    createCategoryDto: CreateCategoryDto[],

    domain: string,
  ) {
    console.log('[CategoryService.createMany] Request received', {
      count: createCategoryDto.length,
      domain,
    });
    console.log('[CategoryService.createMany] Resolving company id');
    const companyId = await this.resolveCompanyId(domain);
    if (!companyId) {
      throw new InternalServerErrorException(
        `Company not found for domain: ${domain}`,
      );
    }
    try {
      console.log('[CategoryService.createMany] Inserting category batch');
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
      throw new InternalServerErrorException('Failed to create categories', {
        cause: error,
      });
    }
  }
  async findOne(id: string, domain: string) {
    console.log('[CategoryService.findOne] Request received', { id, domain });
    console.log('[CategoryService.findOne] Resolving company id');
    const companyId = await this.resolveCompanyId(domain);
    if (!companyId) {
      throw new InternalServerErrorException(
        `Company not found for domain: ${domain}`,
      );
    }

    console.log('[CategoryService.findOne] Querying category by id');
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
    console.log('[CategoryService.update] Request received', {
      id,
      domain,
      name: updateCategoryDto.name,
    });
    console.log('[CategoryService.update] Resolving company id');
    const companyId = await this.resolveCompanyId(domain);
    if (!companyId) {
      throw new InternalServerErrorException(
        `Company not found for domain: ${domain}`,
      );
    }
    try {
      console.log('[CategoryService.update] Updating category record');
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
      throw new InternalServerErrorException('Failed to update category', {
        cause: error,
      });
    }
  }
  async delete(id: string, domain: string) {
    console.log('[CategoryService.delete] Request received', { id, domain });
    console.log('[CategoryService.delete] Resolving company id');
    const companyId = await this.resolveCompanyId(domain);
    if (!companyId) {
      throw new InternalServerErrorException(
        `Company not found for domain: ${domain}`,
      );
    }
    try {
      console.log('[CategoryService.delete] Deleting category record');
      await this.db
        .delete(categories)
        .where(
          and(eq(categories.id, id), eq(categories.company_id, companyId)),
        );
      console.log('[CategoryService.delete] Category deleted successfully');
      return {
        message: 'Category deleted successfully',
        status: HttpStatus.OK,
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to delete category', {
        cause: error,
      });
    }
  }
}
