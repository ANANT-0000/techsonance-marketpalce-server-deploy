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
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/CreateCategory.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RoleGuard } from '../../guards/role.guard';
import { Role } from '../../enums/role.enum';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller({
  version: '1',
  path: 'categories',
})
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post('create-many-categories')
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
  createMany(
    @Headers('company-domain') domain: string,
    @Body('categories') createCategoryDtos: CreateCategoryDto[],
  ) {
    return this.categoryService.createMany(createCategoryDtos, domain);
  }
  @Get('homepage')
  getHomepageCategories(
    @Headers('company-domain') domain: string,
    @Query('limit') limit?: number,
  ) {
    return this.categoryService.getHomepageCategories(domain, Number(limit) || 8);
  }

  @Get()
  findAll(
    @Headers('company-domain') domain: string,
    @Query('search') search?: string,
    @Query('offset') offset?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('date') date?: string,
    @Query('sortby') sortby?: 'asc' | 'desc',
  ) {
    return this.categoryService.findAll(domain, {
      search: search ?? '',
      limit: Number(limit) || 10,
      offset: Number(offset) || 0,
      status,
      date: date ?? '',
      sortby: sortby ?? 'desc',
    });
  }
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
  create(
    @Headers('company-domain') domain: string,
    @Body('category') createCategoryDto: any,
  ) {
    console.log('Received request to create category for domain:', domain);
    console.log('Category data:', createCategoryDto);
    return this.categoryService.create(createCategoryDto, domain);
  }
  @Get(':id')
  findOne(@Headers('company-domain') domain: string, @Param('id') id: string) {
    return this.categoryService.findOne(id, domain);
  }
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
  update(
    @Headers('company-domain') domain: string,
    @Param('id') id: string,
    @Body('category') updateCategoryDto: CreateCategoryDto,
  ) {
    return this.categoryService.update(id, domain, updateCategoryDto);
  }
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
  delete(@Headers('company-domain') domain: string, @Param('id') id: string) {
    return this.categoryService.delete(id, domain);
  }
}
