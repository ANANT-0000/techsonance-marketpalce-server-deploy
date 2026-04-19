import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
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
import { type ProductFiles } from 'src/common/Types/index.type';
// import { ParseJsonPipe } from 'src/common/pipes/parseJsonPipe';
// import { validate } from 'class-validator';
// import { plainToInstance } from 'class-transformer';
@Controller({
  version: '1',
  path: 'products',
})
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Post(':vendor_id')
  @UploadToCloud([
    { name: 'product', maxCount: 1 },
    { name: 'product_spec', maxCount: 10 },
  ])
  async createProduct(
    @Body('product_data', ParseJsonPipe) productDto: any,
    @Param('vendor_id') vendorId: string,
    @Headers('company-domain') domain: string,
    @UploadedFiles() files?: ProductFiles,
  ) {
    console.log(' Received product data:', productDto);
    console.log('vendorId', vendorId);
    console.log('companyId', domain);
    console.log('Received files:', files);
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
  async getAllProducts(@Headers('company-domain') companyId: string) {
    console.log('get all products');
    return await this.productsService.getProducts(companyId);
  }
  @Get(':id')
  async getProductById(
    @Param('id') id: string,
    @Headers('company-domain') domain: string,
  ) {
    return await this.productsService.getProductById(id, domain);
  }

  @Patch(':id')
  @UploadToCloud([
    { name: 'product', maxCount: 1 },
    { name: 'product_spec', maxCount: 10 },
  ])
  async updateProduct(
    @Param('id') id: string,
    @Body('product_data', ParseJsonPipe) product: any,
    @Body('imagesToDelete', ParseJsonPipe) imagesToDelete?: string[],
    @UploadedFiles() files?: ProductFiles,
  ) {
    // console.log(imagesToDelete);
    return await this.productsService.updateProduct(
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
