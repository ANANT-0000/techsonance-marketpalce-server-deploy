import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Headers,
} from '@nestjs/common';
import { ProductPoliciesService } from './product-policies.service';
import { CreateProductPolicyDto } from './dto/create-product-policy.dto';
import { UpdateProductPolicyDto } from './dto/update-product-policy.dto';
import {
  AssignCategoryPolicyDto,
  AssignProductPolicyOverrideDto,
} from './dto/product-policy.dto';

@Controller({ version: '1', path: 'product-policies' })
export class ProductPoliciesController {
  constructor(
    private readonly productPoliciesService: ProductPoliciesService,
  ) {}

  // ==========================================
  // BASE POLICY CRUD
  // ==========================================

  @Post()
  create(
    @Body() createProductPolicyDto: CreateProductPolicyDto,
    @Headers('company-domain') domain: string,
  ) {
    return this.productPoliciesService.create(createProductPolicyDto, domain);
  }

  @Get()
  findAll(@Headers('company-domain') domain: string) {
    return this.productPoliciesService.findAll(domain);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Headers('company-domain') domain: string) {
    return this.productPoliciesService.findOne(id, domain);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateProductPolicyDto: UpdateProductPolicyDto,
    @Headers('company-domain') domain: string,
  ) {
    return this.productPoliciesService.update(
      id,
      updateProductPolicyDto,
      domain,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Headers('company-domain') domain: string) {
    //@ts-ignore
    return this.productPoliciesService.delete(id, domain);
  }

  // ==========================================
  // CATEGORY POLICY ASSIGNMENTS
  // ==========================================

  @Post('category-assign')
  assignCategoryPolicy(
    @Body() dto: AssignCategoryPolicyDto,
    @Headers('company-domain') domain: string,
  ) {
    return this.productPoliciesService.assignCategoryPolicy(dto, domain);
  }

  @Get('category/:categoryId')
  getCategoryPolicies(@Param('categoryId') categoryId: string) {
    return this.productPoliciesService.getCategoryPolicies(categoryId);
  }

  @Delete('category-assign/:id')
  removeCategoryPolicy(@Param('id') id: string) {
    return this.productPoliciesService.removeCategoryPolicy(id);
  }

  // ==========================================
  // PRODUCT POLICY OVERRIDES
  // ==========================================

  @Post('product-override')
  assignProductPolicyOverride(
    @Body() dto: AssignProductPolicyOverrideDto,
    @Headers('company-domain') domain: string,
  ) {
    return this.productPoliciesService.assignProductPolicyOverride(dto, domain);
  }

  @Get('product-override/:productId')
  getProductPolicyOverrides(@Param('productId') productId: string) {
    return this.productPoliciesService.getProductPolicyOverrides(productId);
  }

  @Delete('product-override/:id')
  removeProductPolicyOverride(@Param('id') id: string) {
    return this.productPoliciesService.removeProductPolicyOverride(id);
  }

  // ==========================================
  // ORDER ITEM POLICY SNAPSHOTS
  // ==========================================

  @Get('order-item/:orderItemId')
  getOrderItemPolicy(@Param('orderItemId') orderItemId: string) {
    return this.productPoliciesService.getOrderItemPolicy(orderItemId);
  }

  @Get('coverage/overview')
  getCoverageOverview(@Headers('company-domain') domain: string) {
    return this.productPoliciesService.getCoverageOverview(domain);
  }

  @Get('coverage/:policyId')
  getPolicyCoverageDetails(
    @Param('policyId') policyId: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.productPoliciesService.getCoverageOverview(domain, policyId);
  }

  // ==========================================
  // WARRANTY PAYLOAD (CLIENT-SIDE PDF)
  // ==========================================

  /**
   * Returns structured warranty payload(s) for all policy-bearing order items.
   * The client uses this JSON to generate warranty PDFs locally (no Puppeteer).
   * Route: GET /v1/product-policies/warranty-payload/:orderId
   */
  @Get('warranty-payload/:orderId')
  getWarrantyPayload(@Param('orderId') orderId: string) {
    return this.productPoliciesService.getWarrantyPayload(orderId);
  }
}
