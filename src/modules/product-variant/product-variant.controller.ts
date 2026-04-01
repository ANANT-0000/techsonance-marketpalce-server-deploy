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

  @Get('product-variants/:vendorId')
  findAll(@Param('vendorId') vendorId: string) {
    return this.productVariantService.findAll(vendorId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.productVariantService.findOne(id);
  }

  // @Patch(':id')
  // async update(
  //   @Param('id') id: string,
  //   @Body() updateProductVariantDto: UpdateProductVariantDto,
  //   @UploadedFiles() files: Express.Multer.File[],
  // ) {
  //   return this.productVariantService.update(
  //     id,
  //     updateProductVariantDto,
  //     files,
  //   );
  // }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return await this.productVariantService.delete(id);
  }
}
