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
  async findAll(domain: string) {
    const companyId = await this.resolveCompanyId(domain);
    const allCategories = await this.db
      .select()
      .from(categories)
      .where(eq(categories.company_id, companyId))
      .catch((error) => {
        console.error(
          `[CategoryService.findAll] Failed while fetching categories for companyId ${companyId}`,
          error,
        );
        throw new InternalServerErrorException('Failed to fetch categories', {
          cause: error,
        });
      });
    console.log('all category', allCategories);
    return allCategories;
  }

  async create(createCategoryDto: CreateCategoryDto, domain: string) {
    console.log('category', createCategoryDto);
    const companyId = await this.resolveCompanyId(domain);
    if (!companyId) {
      throw new InternalServerErrorException(
        `Company not found for domain: ${domain}`,
      );
    }
    try {
      const newCategory = await this.db.insert(categories).values({
        name: createCategoryDto.name,
        description: createCategoryDto.description,
        parent_id: createCategoryDto.parent_id || null,
        company_id: companyId || null,
      });
      console.log(newCategory);
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
      throw new InternalServerErrorException('Failed to create categories', {
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
      throw new InternalServerErrorException('Failed to update category', {
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
      console.log('delete successfully');
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
