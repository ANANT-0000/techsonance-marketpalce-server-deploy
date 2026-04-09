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
} from '@nestjs/common';
import { ProductVariantService } from './product-variant.service';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
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
    @UploadedFiles()
    files: {
      product?: Express.Multer.File;
      product_spec?: Express.Multer.File[];
    },
  ) {
    console.log('createProductVariantDto', createProductVariantDto);
    return this.productVariantService.create(createProductVariantDto, files);
  }

  @Get('vendor-products-variants/:vendorId')
  findAll(@Param('vendorId') vendorId: string) {
    return this.productVariantService.findAll(vendorId);
  }

  @Get(':productId')
  findAllVariants(@Param('productId') productId: string) {
    return this.productVariantService.findAllVariantsByProductId(productId);
  }
  @Get('variant/:id')
  findOne(@Param('id') id: string) {
    return this.productVariantService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body('variant_data', ParseJsonPipe)
    updateProductVariantDto: UpdateProductVariantDto,
    @Body('imagesToDelete', ParseJsonPipe) imagesToDelete: string[],
    @UploadedFiles() files: ProductFiles,
  ) {
    return this.productVariantService.update(
      id,
      updateProductVariantDto,
      imagesToDelete,
      files,
    );
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return await this.productVariantService.delete(id);
  }
}
