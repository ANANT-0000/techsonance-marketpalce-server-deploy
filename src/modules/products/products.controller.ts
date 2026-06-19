import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Patch,
  Post,
  Query,
  UploadedFiles,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { UploadToCloud } from '../../common/decorators/upload.decorator';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/createProduct.dto';
import { ProductStatus, UserRole } from '../../drizzle/types/types';
import { ParseJsonPipe } from '../../common/pipes/parseJsonPipe';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { type ProductFiles } from '../../common/Types/index.type';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RoleGuard } from '../../guards/role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../enums/role.enum';
import { GetProductsQueryDto } from './dto/get-products-query.dto';
import { Public } from '../../common/decorators/public.decorator';

@Controller({
  version: '1',
  path: 'products',
})
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Post(':vendor_id')
  @UseGuards(RoleGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
  @UploadToCloud([
    { name: 'product', maxCount: 1 },
    { name: 'product_spec', maxCount: 20 },
  ])
  async createProduct(
    @Body('product_data', ParseJsonPipe) productDto: any,
    @Param('vendor_id') vendorId: string,
    @Headers('company-domain') domain: string,
    @UploadedFiles() files?: ProductFiles,
  ) {
    const dto = plainToInstance(CreateProductDto, productDto);
    const errors = await validate(dto);
    return await this.productsService.createProduct(
      productDto,
      vendorId,
      domain,
      files,
    );
  }
  @Get('vendor-products')
  async getVendorProducts(
    @Headers('company-domain') domain: string,
    @Query() query: GetProductsQueryDto,
  ) {
    return await this.productsService.getVendorProducts(domain, query);
  }
  @Public()
  @Get('all')
  async getAllProducts(
    @Headers('company-domain') domain: string,
    @Query() query: GetProductsQueryDto,
  ) {
    return await this.productsService.getAllProducts(domain, query);
  }

  @Public()
  @Get('suggestions')
  async getProductSuggestions(
    @Headers('company-domain') domain: string,
    @Query('search') search: string,
  ) {
    return await this.productsService.getProductSuggestions(domain, search);
  }

  @Public()
  @Get('options')
  async getAllProductOptions(@Headers('company-domain') domain: string) {
    return await this.productsService.getAllProductOptions(domain);
  }

  @Public()
  @Get('homepage')
  async getHomepageProducts(
    @Headers('company-domain') domain: string,
    @Query('limit') limit?: number,
  ) {
    return await this.productsService.getHomepageProducts(
      domain,
      Number(limit) || 8,
    );
  }

  @Get('active')
  @UseGuards(RoleGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
  async getActiveProducts(
    @Headers('company-domain') domain: string,
    @Query('search') search?: string,
    @Query('offset') offset?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('date') date?: string,
    @Query('sortby') sortby?: 'asc' | 'desc',
  ) {
    return await this.productsService.getActiveProducts(domain, {
      search: search ?? '',
      limit: Number(limit) || 10,
      offset: Number(offset) || 0,
      status,
      date: date ?? '',
      sortby: sortby ?? 'desc',
    });
  }

  @Public()
  @Get('main-details/:id')
  @HttpCode(HttpStatus.OK)
  async getProductMainDetails(
    @Param('id') id: string,
    @Headers('company-domain') domain: string,
  ) {
    return await this.productsService.getProductMainDetails(id, domain);
  }

  @Patch(':id')
  @UseGuards(RoleGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
  @UploadToCloud([
    { name: 'product', maxCount: 1 },
    { name: 'product_spec', maxCount: 20 },
  ])
  async updateProduct(
    @Param('id') id: string,
    @Body('product_data', ParseJsonPipe) product: any,
    @Headers('company-domain') domain: string,
    @Body('imagesToDelete') imagesToDelete?: string | string[],
    @UploadedFiles() files?: ProductFiles,
  ) {
    let parsedImagesToDelete: string[] | undefined;
    if (imagesToDelete) {
      if (typeof imagesToDelete === 'string') {
        try {
          parsedImagesToDelete = JSON.parse(imagesToDelete);
        } catch {
          parsedImagesToDelete = undefined;
        }
      } else if (Array.isArray(imagesToDelete)) {
        parsedImagesToDelete = imagesToDelete;
      }
    }
    return await this.productsService.updateProduct(
      domain,
      id,
      product,
      parsedImagesToDelete,
      files,
    );
  }

  @Patch('update-product-category/:id')
  @UseGuards(RoleGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
  async updateProductCategory(
    @Param('id') id: string,
    @Body('category_id') categoryId: string,
  ) {
    return await this.productsService.UpdateProductCategory(categoryId, id);
  }

  @Public()
  @Get(':id/details')
  async getProductDetailsById(
    @Param('id') id: string,
    @Headers('company-domain') domain: string,
  ) {
    return await this.productsService.getProductDetailsById(id, domain);
  }

  @Public()
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getProductById(
    @Param('id') id: string,
    @Headers('company-domain') domain: string,
  ) {
    return await this.productsService.getProductById(id, domain);
  }

  @Delete('delete-selected')
  @UseGuards(RoleGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
  async deleteSelectedProduct(@Body('ids') ids: string[]) {
    return await this.productsService.deleteSelectedProducts(ids);
  }

  @Delete('delete-selected-variants')
  @UseGuards(RoleGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
  async deleteSelectedProductVariants(@Body('ids') ids: string[]) {
    return await this.productsService.deleteSelectedProductVariants(ids);
  }

  @Delete(':id')
  @UseGuards(RoleGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
  async deleteProduct(@Param('id') id: string) {
    return await this.productsService.deleteProduct(id);
  }

  @Delete('delete-variant/:id')
  @UseGuards(RoleGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
  async deleteProductVariant(@Param('id') id: string) {
    return await this.productsService.deleteProductVariant(id);
  }
}
