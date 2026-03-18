import { Inject, Injectable } from '@nestjs/common';
import { CreateCategoryDto } from './dto/CreateCategory.dto';
import { DRIZZLE } from 'src/drizzle/drizzle.module';
import { type DrizzleDB } from 'src/drizzle/types/drizzle';
import { categories } from 'src/drizzle/schema';
import { eq } from 'drizzle-orm';
@Injectable()
export class CategoryService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async create(createCategoryDto: CreateCategoryDto) {
    await this.db.insert(categories).values({
      name: createCategoryDto.name,
      description: createCategoryDto.description,
      parent_id: createCategoryDto.parent_id || null,
    });
    return { message: 'Category created successfully', status: 201 };
  }

  async findAll() {
    const allCategories = await this.db.select().from(categories);
    return allCategories;
  }
  async findOne(id: string) {
    const category = await this.db
      .select()
      .from(categories)
      .where(eq(categories.id, id));
    return category;
  }
  async update(id: string, updateCategoryDto: CreateCategoryDto) {
    await this.db
      .update(categories)
      .set({
        name: updateCategoryDto.name,
        description: updateCategoryDto.description,
        parent_id: updateCategoryDto.parent_id || null,
      })
      .where(eq(categories.id, id));
    return { message: 'Category updated successfully', status: 200 };
  }
  async delete(id: string) {
    await this.db.delete(categories).where(eq(categories.id, id));
    return { message: 'Category deleted successfully', status: 200 };
  }
}
