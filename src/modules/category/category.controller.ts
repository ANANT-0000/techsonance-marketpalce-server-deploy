import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/CreateCategory.dto';

@Controller({
  version: '1',
  path: 'categories',
})
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}
  @Get(':vendorId')
  findByVendorId(@Param('vendorId') vendorId: string) {
    return this.categoryService.findByVendorId(vendorId);
  }
  @Post(':vendorId')
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('vendorId') vendorId: string,
    @Body('companyId') companyId: string,
    @Body('category') createCategoryDto: CreateCategoryDto,
  ) {
    console.log(
      'Received request to create category for vendor:',
      vendorId,
      companyId,
    );
    console.log('Category data:', createCategoryDto);
    return this.categoryService.create(createCategoryDto, vendorId, companyId);
  }
  @Post('create-many-categories')
  createMany(
    @Body('vendorId') vendorId: string,
    @Body('companyId') companyId: string,
    @Body('categories') createCategoryDtos: CreateCategoryDto[],
  ) {
    return this.categoryService.createMany(
      createCategoryDtos,
      vendorId,
      companyId,
    );
  }
  @Get(':vendorId/:id')
  findOne(@Param('vendorId') vendorId: string, @Param('id') id: string) {
    return this.categoryService.findOne(id, vendorId);
  }
  @Patch(':vendorId/:id')
  update(
    @Param('vendorId') vendorId: string,
    @Param('id') id: string,
    @Body('category') updateCategoryDto: CreateCategoryDto,
  ) {
    return this.categoryService.update(id, vendorId, updateCategoryDto);
  }
  @Delete(':vendorId/:id')
  delete(@Param('vendorId') vendorId: string, @Param('id') id: string) {
    return this.categoryService.delete(id, vendorId);
  }
}
