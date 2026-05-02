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
  UseGuards,
} from '@nestjs/common';
import { UploadToCloud } from 'src/common/decorators/upload.decorator';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/createProduct.dto';
import { Param } from '@nestjs/common';
import { ProductStatus, UserRole } from 'src/drizzle/types/types';
import { ParseJsonPipe } from 'src/common/pipes/parseJsonPipe';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { type ProductFiles } from 'src/common/Types/index.type';
import { AuthGuard } from '@nestjs/passport';
import { RoleGuard } from 'src/guards/role.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/enums/role.enum';
// import { ParseJsonPipe } from 'src/common/pipes/parseJsonPipe';
// import { validate } from 'class-validator';
// import { plainToInstance } from 'class-transformer';
@Controller({
  version: '1',
  path: 'products',
})
export class ProductsController {
  constructor(private productsService: ProductsService) { }

  @Post(':vendor_id')
  @UseGuards(RoleGuard, JwtAuthGuard)
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
  async getAllProducts(@Headers('company-domain') domain: string) {
    console.log('get all products');
    return await this.productsService.getAllProducts(domain);
  }
  @Get('active')
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
  async getActiveProducts(@Headers('company-domain') domain: string) {
    return await this.productsService.getActiveProducts(domain)
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
