import { Injectable } from '@nestjs/common';
import { CreateProductPolicyDto } from './dto/create-product-policy.dto';
import { UpdateProductPolicyDto } from './dto/update-product-policy.dto';

@Injectable()
export class ProductPoliciesService {
  create(createProductPolicyDto: CreateProductPolicyDto) {
    return 'This action adds a new productPolicy';
  }

  findAll() {
    return `This action returns all productPolicies`;
  }

  findOne(id: number) {
    return `This action returns a #${id} productPolicy`;
  }

  update(id: number, updateProductPolicyDto: UpdateProductPolicyDto) {
    return `This action updates a #${id} productPolicy`;
  }

  remove(id: number) {
    return `This action removes a #${id} productPolicy`;
  }
}
