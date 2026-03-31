import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  UploadedFiles,
} from '@nestjs/common';
import { UploadToCloud } from 'src/common/decorators/upload.decorator';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/createProduct.dto';
import { Param } from '@nestjs/common';
import { ProductStatus } from 'src/drizzle/types/types';
import { ParseJsonPipe } from 'src/common/pipes/parseJsonPipe';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
// import { ParseJsonPipe } from 'src/common/pipes/parseJsonPipe';
// import { validate } from 'class-validator';
// import { plainToInstance } from 'class-transformer';
export interface ProductFiles {
  product?: Express.Multer.File[];
  product_spec?: Express.Multer.File[];
}
@Controller({
  version: '1',
  path: 'products',
})
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  // @Get(':id')
  // async getProduct(@Param('id') id: string) {
  //   return await this.productsService.getProductById(id);
  // }

  @Post(':company_id/:vendor_id')
  @UploadToCloud([
    { name: 'product', maxCount: 1 },
    { name: 'product_spec', maxCount: 10 },
  ])
  async createProduct(
    @Body('product_data', ParseJsonPipe) productDto: any,
    @Param('vendor_id') vendorId: string,
    @Param('company_id') companyId: string,
    @UploadedFiles() files?: ProductFiles,
  ) {
    console.log(' Received product data:', productDto);
    console.log('vendorId', vendorId);
    console.log('companyId', companyId);
    console.log('Received files:', files);
    const dto = plainToInstance(CreateProductDto, productDto);
    const errors = await validate(dto);
    console.log('VALIDATION ERRORS:', JSON.stringify(errors, null, 2));

    return await this.productsService.createProduct(
      productDto,
      vendorId,
      companyId,
      files,
    );
  }
  @Get(':vendorId/all')
  async getAllProducts(@Param('vendorId') vendorId: string) {
    console.log('get all products');
    return await this.productsService.getProducts(vendorId);
  }
  @Get(':id')
  async getProductById(@Param('id') id: string) {
    return await this.productsService.getProductById(id);
  }
  @Patch(':id')
  async updateProduct(
    @Param('id') id: string,
    @Body('product') product: CreateProductDto,
  ) {
    return await this.productsService.updateProduct(id, product);
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
