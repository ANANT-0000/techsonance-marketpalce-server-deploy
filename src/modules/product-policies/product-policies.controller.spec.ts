import { Test, TestingModule } from '@nestjs/testing';
import { ProductPoliciesController } from './product-policies.controller';
import { ProductPoliciesService } from './product-policies.service';

describe('ProductPoliciesController', () => {
  let controller: ProductPoliciesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductPoliciesController],
      providers: [ProductPoliciesService],
    }).compile();

    controller = module.get<ProductPoliciesController>(ProductPoliciesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
