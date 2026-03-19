import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  UploadedFiles,
} from '@nestjs/common';
import { UploadImgs } from 'src/common/decorators/upload.decorators';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/createProduct.dto';
import { Param } from '@nestjs/common';
import { ProductStatus } from 'src/drizzle/types/types';
export interface ProductFiles {
  product?: Express.Multer.File[];
  productSpec?: Express.Multer.File[];
}
@Controller('products')
export class ProductsController {
  constructor(private productsService: ProductsService) {}
  @Post('create')
  @UploadImgs([
    { name: 'product', maxCount: 1 },
    { name: 'productSpec', maxCount: 5 },
  ])
  async createProduct(
    @Body('product_data') productDto: CreateProductDto,
    @Body('vendor_id') vendorId: string,
    @Body('company_id') companyId: string,
    @UploadedFiles() files: ProductFiles,
  ) {
    return await this.productsService.createProduct(
      productDto,
      vendorId,
      companyId,
      files,
    );
  }
  @Get('')
  async getAllProducts() {
    return await this.productsService.getAllProducts();
  }
  @Get(':id')
  async getProductById(@Param('id') id: string) {
    return await this.productsService.getProductById(id);
  }
  @Patch(':id')
  async updateProduct(
    @Param('id') id: string,
    @Body() productDto: CreateProductDto,
  ) {
    return await this.productsService.updateProduct(id, productDto);
  }
  @Patch('update-product-category/:id')
  async updateProductCategory(
    @Param('id') id: string,
    @Body('category_id') categoryId: string,
  ) {
    return await this.productsService.UpdateProductCategory(categoryId, id);
  }
  @Patch('update-product-status/:id')
  async updateProductStatus(
    @Param('id') id: string,
    @Body('status') status: ProductStatus,
  ) {
    return await this.productsService.UpdateProductStatus(status, id);
  }
  @Patch('update-qty/:id')
  async updateProductQty(
    @Param('id') id: string,
    @Body('quantity') quantity: number,
  ) {
    return await this.productsService.qtyUpdate(id, quantity);
  }

  @Delete(':id')
  async deleteProduct(@Param('id') id: string) {
    return await this.productsService.deleteProduct(id);
  }
  @Delete('delete-selected')
  async deleteSelectedProduct(@Body('ids') ids: string[]) {
    return await this.productsService.deleteSelectedProducts(ids);
  }
  @Delete('delete-variant/:id')
  async deleteProductVariant(@Param('id') id: string) {
    return await this.productsService.deleteProductVariant(id);
  }

  @Delete('delete-selected-variants')
  async deleteSelectedProductVariants(@Body('ids') ids: string[]) {
    return await this.productsService.deleteSelectedProductVariants(ids);
  }
}
