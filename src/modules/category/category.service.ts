import {
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { CreateCategoryDto } from './dto/CreateCategory.dto';
import { DRIZZLE } from 'src/drizzle/drizzle.module';
import { type DrizzleDB } from 'src/drizzle/types/drizzle';
import { categories, company } from 'src/drizzle/schema';
import { and, eq, or } from 'drizzle-orm';
@Injectable()
export class CategoryService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findAll() {
    const allCategories = await this.db.select().from(categories);
    return allCategories;
  }
  async findByVendorId(vendorId: string) {
    const vendorCategories = await this.db
      .select()
      .from(categories)
      .where(eq(categories.vendor_id, vendorId));
    console.log('vendor category', vendorCategories);
    return vendorCategories;
  }

  async create(
    createCategoryDto: CreateCategoryDto,
    vendorId: string,
    companyId: string,
  ) {
    console.log('Creating category for vendor:', vendorId);
    console.log('category', createCategoryDto);
    try {
      const newCategory = await this.db.insert(categories).values({
        name: createCategoryDto.name,
        description: createCategoryDto.description,
        parent_id: createCategoryDto.parent_id || null,
        company_id: companyId || null,
        vendor_id: vendorId || null,
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
    vendorId: string,
    companyId: string,
  ) {
    try {
      const categoryValues = createCategoryDto.map((dto) => ({
        name: dto.name,
        description: dto.description,
        parent_id: dto.parent_id || null,
        company_id: companyId || null,
        vendor_id: vendorId || null,
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
  async findOne(id: string, vendorId: string) {
    const category = await this.db
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.vendor_id, vendorId)));
    return category;
  }
  async update(
    id: string,
    vendorId: string,
    updateCategoryDto: CreateCategoryDto,
  ) {
    try {
      await this.db
        .update(categories)
        .set({
          name: updateCategoryDto.name,
          description: updateCategoryDto.description,
          parent_id: updateCategoryDto.parent_id || null,
        })
        .where(and(eq(categories.id, id), eq(categories.vendor_id, vendorId)));
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
  async delete(id: string, vendorId: string) {
    try {
      await this.db
        .delete(categories)
        .where(and(eq(categories.id, id), eq(categories.vendor_id, vendorId)));
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
