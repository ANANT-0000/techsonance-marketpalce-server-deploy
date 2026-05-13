import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ProductPoliciesService } from './product-policies.service';
import { CreateProductPolicyDto } from './dto/create-product-policy.dto';
import { UpdateProductPolicyDto } from './dto/update-product-policy.dto';

@Controller('product-policies')
export class ProductPoliciesController {
  constructor(private readonly productPoliciesService: ProductPoliciesService) {}

  @Post()
  create(@Body() createProductPolicyDto: CreateProductPolicyDto) {
    return this.productPoliciesService.create(createProductPolicyDto);
  }

  @Get()
  findAll() {
    return this.productPoliciesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productPoliciesService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateProductPolicyDto: UpdateProductPolicyDto) {
    return this.productPoliciesService.update(+id, updateProductPolicyDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productPoliciesService.remove(+id);
  }
}
