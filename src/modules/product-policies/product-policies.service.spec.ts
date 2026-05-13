import { Test, TestingModule } from '@nestjs/testing';
import { ProductPoliciesService } from './product-policies.service';

describe('ProductPoliciesService', () => {
  let service: ProductPoliciesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProductPoliciesService],
    }).compile();

    service = module.get<ProductPoliciesService>(ProductPoliciesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
