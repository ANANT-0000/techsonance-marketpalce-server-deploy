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
  UseGuards,
} from '@nestjs/common';
import { ProductVariantService } from './product-variant.service';
import { UploadToCloud } from '../../common/decorators/upload.decorator';
import { ParseJsonPipe } from '../../common/pipes/parseJsonPipe';
import { type ProductFiles } from '../../common/Types/index.type';
import { ProductStatus } from '../../drizzle/types/types';
import { Public } from '../../common/decorators/public.decorator';
import { RoleGuard } from '../../guards/role.guard';
import { Role } from '../../enums/role.enum';
import { Roles } from '../../common/decorators/roles.decorator';

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
  @UseGuards(RoleGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
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
  @UseGuards(RoleGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
  getStockManagerVariants(@Headers('company-domain') domain: string) {
    return this.productVariantService.getVariantsForStockManager(domain);
  }
  @Get('vendor-products-variants/:vendorId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RoleGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
  findAll(@Param('vendorId') vendorId: string) {
    return this.productVariantService.findAll(vendorId);
  }

  @Public()
  @Get(':productId')
  @HttpCode(HttpStatus.OK)
  findAllVariants(@Param('productId') productId: string) {
    return this.productVariantService.findAllVariantsByProductId(productId);
  }
  @Public()
  @Get('variant/:id')
  @HttpCode(HttpStatus.OK)
  findOne(@Param('id') id: string) {
    return this.productVariantService.findOne(id);
  }
  @Public()
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
  @UseGuards(RoleGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
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
  @UseGuards(RoleGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
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
  @UseGuards(RoleGuard)
  @Roles(Role.ADMIN, Role.VENDOR)
  async delete(@Param('id') id: string) {
    return await this.productVariantService.delete(id);
  }
}
