import { Body, Controller, Post, UploadedFiles } from '@nestjs/common';
import { UploadImgs } from 'src/common/decorators/upload.decorators';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/createProduct.dto';
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
}
