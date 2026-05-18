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
  UseGuards,
  Param,
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

@Controller({
  version: '1',
  path: 'products',
})
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Post(':vendor_id')
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
    console.log('VALIDATION ERRORS:', JSON.stringify(errors, null, 2));
    return await this.productsService.createProduct(
      productDto,
      vendorId,
      domain,
      files,
    );
  }

  @Get('all')
  async getAllProducts(
    @Headers('company-domain') domain: string,
    @Query() query: GetProductsQueryDto,
  ) {
    return await this.productsService.getAllProducts(domain, query);
  }

  /**
   * GET /v1/products/suggestions?search=...
   * Returns lightweight name+id list for autocomplete (P2)
   */
  @Get('suggestions')
  async getProductSuggestions(
    @Headers('company-domain') domain: string,
    @Query('search') search: string,
  ) {
    return await this.productsService.getProductSuggestions(domain, search);
  }

  @Get('options')
  async getAllProductOptions(@Headers('company-domain') domain: string) {
    return await this.productsService.getAllProductOptions(domain);
  }

  @Get('active')
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
  async getActiveProducts(@Headers('company-domain') domain: string) {
    return await this.productsService.getActiveProducts(domain);
  }

  @Get('main-details/:id')
  async getProductMainDetails(
    @Param('id') id: string,
    @Headers('company-domain') domain: string,
  ) {
    return await this.productsService.getProductMainDetails(id, domain);
  }

  @Patch(':id')
  @UploadToCloud([
    { name: 'product', maxCount: 1 },
    { name: 'product_spec', maxCount: 20 },
  ])
  async updateProduct(
    @Param('id') id: string,
    @Body('product_data', ParseJsonPipe) product: any,
    @Headers('company-domain') domain: string,
    @Body('imagesToDelete', ParseJsonPipe) imagesToDelete?: string[],
    @UploadedFiles() files?: ProductFiles,
  ) {
    return await this.productsService.updateProduct(
      domain,
      id,
      product,
      imagesToDelete,
      files,
    );
  }

  @Patch('update-product-category/:id')
  async updateProductCategory(
    @Param('id') id: string,
    @Body('category_id') categoryId: string,
  ) {
    return await this.productsService.UpdateProductCategory(categoryId, id);
  }

  @Get(':id/details')
  async getProductDetailsById(
    @Param('id') id: string,
    @Headers('company-domain') domain: string,
  ) {
    return await this.productsService.getProductDetailsById(id, domain);
  }

  @Get(':id')
  async getProductById(
    @Param('id') id: string,
    @Headers('company-domain') domain: string,
  ) {
    return await this.productsService.getProductById(id, domain);
  }

  @Delete('delete-selected')
  async deleteSelectedProduct(@Body('ids') ids: string[]) {
    return await this.productsService.deleteSelectedProducts(ids);
  }

  @Delete('delete-selected-variants')
  async deleteSelectedProductVariants(@Body('ids') ids: string[]) {
    return await this.productsService.deleteSelectedProductVariants(ids);
  }

  @Delete(':id')
  async deleteProduct(@Param('id') id: string) {
    return await this.productsService.deleteProduct(id);
  }

  @Delete('delete-variant/:id')
  async deleteProductVariant(@Param('id') id: string) {
    return await this.productsService.deleteProductVariant(id);
  }
}
