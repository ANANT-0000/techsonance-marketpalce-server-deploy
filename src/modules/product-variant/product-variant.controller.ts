import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UploadedFiles,
  HttpStatus,
  HttpCode,
  Headers,
} from '@nestjs/common';
import { ProductVariantService } from './product-variant.service';
import { UploadToCloud } from '../../common/decorators/upload.decorator';
import { ParseJsonPipe } from '../../common/pipes/parseJsonPipe';
import { type ProductFiles } from '../../common/Types/index.type';
import { ProductStatus } from '../../drizzle/types/types';

@Controller({
  version: '1',
  path: 'product-variant',
})
export class ProductVariantController {
  constructor(private readonly productVariantService: ProductVariantService) {}

  @Post()
  @UploadToCloud([
    { name: 'product', maxCount: 1 },
    { name: 'product_spec', maxCount: 10 },
  ])
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body('variant_data', ParseJsonPipe) createProductVariantDto: any,
    @Headers('company-domain') domain: string,
    @UploadedFiles()
    files: ProductFiles,
  ) {
    return this.productVariantService.create(
      createProductVariantDto,
      domain,
      files,
    );
  }
  // Add this new route
  @Get('stock-manager')
  @HttpCode(HttpStatus.OK)
  getStockManagerVariants(@Headers('company-domain') domain: string) {
    return this.productVariantService.getVariantsForStockManager(domain);
  }
  @Get('vendor-products-variants/:vendorId')
  @HttpCode(HttpStatus.OK)
  findAll(@Param('vendorId') vendorId: string) {
    return this.productVariantService.findAll(vendorId);
  }

  @Get(':productId')
  @HttpCode(HttpStatus.OK)
  findAllVariants(@Param('productId') productId: string) {
    return this.productVariantService.findAllVariantsByProductId(productId);
  }
  @Get('variant/:id')
  @HttpCode(HttpStatus.OK)
  findOne(@Param('id') id: string) {
    return this.productVariantService.findOne(id);
  }
  @Get('details/:id')
  @HttpCode(HttpStatus.OK)
  findVariantDetails(@Param('id') id: string) {
    return this.productVariantService.findVariantDetailsById(id);
  }
  @Patch(':id')
  @UploadToCloud([
    { name: 'product', maxCount: 1 },
    { name: 'product_spec', maxCount: 10 },
  ])
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id') id: string,
    // @Body() body: any,
    @Body(ParseJsonPipe) dto: any,
    @Headers('company-domain') domain: string,
    @UploadedFiles() files: ProductFiles,
    @Body('imagesToDelete') imagesToDelete?: string[],
  ) {
    // ('Received update request :', body);
    return this.productVariantService.update(
      id,
      dto,
      imagesToDelete,
      files,
      domain,
    );
  }
  @Patch('update-status/:id')
  async updateProductStatus(
    @Param('id') id: string,
    @Body('status') status: ProductStatus,
    @Headers('company-domain') domain: string,
  ) {
    return await this.productVariantService.UpdateProductVariantStatus(
      status,
      id,
    );
  }
  @Delete(':id')
  async delete(@Param('id') id: string) {
    return await this.productVariantService.delete(id);
  }
}
