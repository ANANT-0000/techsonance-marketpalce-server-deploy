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
  Req,
} from '@nestjs/common';
import { UploadToCloud } from '../../common/decorators/upload.decorator.js';
import { ProductsService } from './products.service.js';
import { CreateProductDto } from './dto/createProduct.dto.js';
import { ProductStatus, UserRole } from '../../drizzle/types/types.js';
import { ParseJsonPipe } from '../../common/pipes/parseJsonPipe.js';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { type ProductFiles } from '../../common/Types/index.type.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RoleGuard } from '../../guards/role.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../enums/role.enum.js';
import { GetProductsQueryDto } from './dto/get-products-query.dto.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { SkipSubscription } from '../../common/decorators/skip-subscription.decorator.js';
import { FeatureAccessGuard } from '../entitlements/guards/feature-access.guard.js';
import { RequireFeature } from '../entitlements/decorators/require-feature.decorator.js';
import { VendorActiveGuard } from '../../guards/vendor-status.guard.js';
import { UpdateProductDto } from './dto/updatedProduct.dto.js';

@Controller({
  version: '1',
  path: 'products',
})
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Post('create')
  @UseGuards(JwtAuthGuard, RoleGuard, FeatureAccessGuard, VendorActiveGuard)
  @RequireFeature('max_products', { consume: false })
  @Roles(Role.ADMIN, Role.VENDOR)
  async createProduct(
    @Body('product_data') productDto: CreateProductDto,
    @Req() req: any,
    @Headers('company-domain') domain: string,
  ) {
    const vendorId = req.user.vendorId;
    return await this.productsService.createProduct(
      productDto,
      vendorId,
      domain,
    );
  }
  @SkipSubscription()
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
  @UseGuards(RoleGuard, VendorActiveGuard)
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
  @UseGuards(JwtAuthGuard, RoleGuard, VendorActiveGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
  async updateProduct(
    @Param('id') id: string,
    @Body('product_data') product: UpdateProductDto,
    @Headers('company-domain') domain: string,
    @Req() req: any,
    @Body('imagesToDelete') imagesToDelete?: string | string[],
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
    const vendorId = req.user.vendorId;
    return await this.productsService.updateProduct(
      domain,
      id,
      product,
      parsedImagesToDelete,
      vendorId,
    );
  }

  @Patch('update-product-category/:id')
  @UseGuards(JwtAuthGuard, RoleGuard, VendorActiveGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
  async updateProductCategory(
    @Param('id') id: string,
    @Body('category_id') categoryId: string,
    @Req() req: any,
  ) {
    const vendorId = req.user.vendorId;
    return await this.productsService.UpdateProductCategory(
      categoryId,
      id,
      vendorId,
    );
  }

  @Public()
  @Get(':id/related')
  async getRelatedProducts(
    @Param('id') id: string,
    @Headers('company-domain') domain: string,
    @Query('limit') limit?: number,
  ) {
    return await this.productsService.getRelatedProducts(
      domain,
      id,
      limit ? Number(limit) : 8,
    );
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
  @Get('special/on-sale')
  async getOnSaleProducts(
    @Headers('company-domain') domain: string,
    @Query('limit') limit?: number,
  ) {
    return await this.productsService.getOnSaleProducts(
      domain,
      limit ? Number(limit) : 8,
    );
  }

  @Public()
  @Get('collection/:slug')
  async getCollectionProducts(
    @Headers('company-domain') domain: string,
    @Param('slug') slug: string,
    @Query('limit') limit?: number,
  ) {
    return await this.productsService.getCollectionProducts(
      domain,
      slug,
      limit ? Number(limit) : 8,
    );
  }

  @Public()
  @Get(':id/recommended')
  async getRecommendedProducts(
    @Param('id') id: string,
    @Headers('company-domain') domain: string,
    @Query('limit') limit?: number,
  ) {
    return await this.productsService.getRecommendedProducts(
      domain,
      id,
      limit ? Number(limit) : 8,
    );
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
  @UseGuards(JwtAuthGuard, RoleGuard, VendorActiveGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
  async deleteSelectedProduct(@Body('ids') ids: string[], @Req() req: any) {
    const vendorId = req.user.vendorId;
    const result = await this.productsService.deleteSelectedProducts(
      ids,
      vendorId,
      req.user?.companyId,
    );
    return result;
  }

  @Delete('delete-selected-variants')
  @UseGuards(JwtAuthGuard, RoleGuard, VendorActiveGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
  async deleteSelectedProductVariants(
    @Body('ids') ids: string[],
    @Req() req: any,
  ) {
    const vendorId = req.user.vendorId;
    return await this.productsService.deleteSelectedProductVariants(
      ids,
      vendorId,
    );
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RoleGuard, VendorActiveGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
  async deleteProduct(@Param('id') id: string, @Req() req: any) {
    const vendorId = req.user.vendorId;
    const result = await this.productsService.deleteProduct(
      id,
      vendorId,
      req.user?.companyId,
    );
    return result;
  }

  @Delete('delete-variant/:id')
  @UseGuards(JwtAuthGuard, RoleGuard, VendorActiveGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
  async deleteProductVariant(@Param('id') id: string, @Req() req: any) {
    const vendorId = req.user.vendorId;
    return await this.productsService.deleteProductVariant(id, vendorId);
  }
}
