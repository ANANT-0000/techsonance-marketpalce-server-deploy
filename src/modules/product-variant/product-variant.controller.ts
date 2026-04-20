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
// import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { UploadToCloud } from 'src/common/decorators/upload.decorator';
import { ParseJsonPipe } from 'src/common/pipes/parseJsonPipe';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import { type ProductFiles } from 'src/common/Types/index.type';

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
    console.log('createProductVariantDto', createProductVariantDto);
    return this.productVariantService.create(
      createProductVariantDto,
      domain,
      files,
    );
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
    @Body('variant_data', ParseJsonPipe) updateProductVariantDto: any,
    @Body('imagesToDelete', ParseJsonPipe) imagesToDelete: string[],
    @UploadedFiles() files: ProductFiles,
  ) {
    console.log('id', id);
    console.log('updateProductVariantDto', updateProductVariantDto);
    console.log('imagesToDelete', imagesToDelete);
    console.log('fies', files);
    return this.productVariantService.update(
      id,
      updateProductVariantDto,
      imagesToDelete,
      files,
    );
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    console.log('Deleting product variant with ID:', id);
    return await this.productVariantService.delete(id);
  }
}
