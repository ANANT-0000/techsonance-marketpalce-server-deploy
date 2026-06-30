import { PartialType } from '@nestjs/swagger';
import { CreateProductPolicyDto } from './create-product-policy.dto.js';

export class UpdateProductPolicyDto extends PartialType(
  CreateProductPolicyDto,
) {}
