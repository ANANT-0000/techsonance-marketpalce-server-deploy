import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CategoryService } from './category.service.js';
import { CreateCategoryDto } from './dto/CreateCategory.dto.js';
import { UpdateCategoryDto } from './dto/UpdateCategory.dto.js';
import { GetCategoriesQueryDto } from './dto/GetCategoriesQuery.dto.js';
import { RoleGuard } from '../../guards/role.guard.js';
import { Role } from '../../enums/role.enum.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';

@Controller({
  version: '1',
  path: 'categories',
})
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Public()
  @Get('homepage')
  getHomepageCategories(
    @Headers('company-domain') domain: string,
    @Query('limit') limit?: number,
  ) {
    return this.categoryService.getHomepageCategories(
      domain,
      Number(limit) || 8,
    );
  }

  @Public()
  @Get()
  findAll(
    @Headers('company-domain') domain: string,
    @Query() query: GetCategoriesQueryDto,
  ) {
    return this.categoryService.findAll(domain, {
      search: query.search ?? '',
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
      status: query.status,
      date: query.date ?? '',
      sortby: query.sortby ?? 'desc',
    });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RoleGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
  create(
    @Headers('company-domain') domain: string,
    @Body('category') createCategoryDto: CreateCategoryDto,
  ) {
    return this.categoryService.create(createCategoryDto, domain);
  }

  @Public()
  @Get(':category')
  findOne(
    @Headers('company-domain') domain: string,
    @Param('category') category: string,
  ) {
    return this.categoryService.findOne(category, domain);
  }

  @Patch(':id')
  @UseGuards(RoleGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
  update(
    @Headers('company-domain') domain: string,
    @Param('id') id: string,
    @Body('category') updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.categoryService.update(id, domain, updateCategoryDto);
  }

  @Delete(':id')
  @UseGuards(RoleGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
  delete(@Headers('company-domain') domain: string, @Param('id') id: string) {
    return this.categoryService.delete(id, domain);
  }
}
