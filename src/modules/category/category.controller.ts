import { Body, Controller, Delete, Get, Patch, Post } from '@nestjs/common';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/CreateCategory.dto';

@Controller('category')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}
  @Post('/create')
  create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoryService.create(createCategoryDto);
  }
  @Get('/all')
  findAll() {
    return this.categoryService.findAll();
  }
  @Get('/:id')
  findOne(id: string) {
    return this.categoryService.findOne(id);
  }
  @Patch('/:id')
  update(id: string, @Body() updateCategoryDto: CreateCategoryDto) {
    return this.categoryService.update(id, updateCategoryDto);
  }
  @Delete('/:id')
  delete(id: string) {
    return this.categoryService.delete(id);
  }
}
