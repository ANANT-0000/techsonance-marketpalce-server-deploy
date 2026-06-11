import {
  AssignCategoryPolicyDto,
  AssignProductPolicyOverrideDto,
  CreateOrderItemPolicySnapshotDto,
} from './dto/product-policy.dto';
import { CompanyService } from './../company/company.service';
import {
  BadRequestException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateProductPolicyDto,
  PolicyType,
} from './dto/create-product-policy.dto';
import { UpdateProductPolicyDto } from './dto/update-product-policy.dto';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import { and, eq } from 'drizzle-orm';
import {
  category_policy,
  order_item_policy,
  product_policies,
  product_policy_override,
} from '../../drizzle/schema/product_policy.schema';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { orders } from '../../drizzle/schema';
import { PolicyPayloadBuilderService } from './policy-payload-builder.service';
import { ProductPoliciesErrorKeyEnum } from './constants/product-policies.enums';

@Injectable()
export class ProductPoliciesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
    private readonly policyPayloadBuilder: PolicyPayloadBuilderService,
  ) {}

  // ─── helpers ──────────────────────────────────────────────────────────────

  private async resolveCompanyId(domain: string): Promise<string> {
    const filterDomain = domainExtractor(domain);
    return this.companyService.find(filterDomain);
  }

  // ==========================================================================
  // CRUD
  // ==========================================================================

  async create(createDto: CreateProductPolicyDto, domain?: string) {
    if (!domain) {
      throw new BadRequestException(
        ProductPoliciesErrorKeyEnum.A_PRODUCT_POLICY_MUST_BELONG_TO_EITHER_A_VENDOR_OR_A_COMPANY,
      );
    }

    const companyId = await this.resolveCompanyId(domain);

    try {
      const [newPolicy] = await this.db
        .insert(product_policies)
        .values({
          ...createDto,
          company_id: companyId || null,
          generates_document: createDto.generates_document ?? false,
          is_active: createDto.is_active ?? true,
        })
        .returning();


      return {
        message: 'Product policy created successfully',
        status: HttpStatus.CREATED,
        data: newPolicy,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        ProductPoliciesErrorKeyEnum.DATABASE_ERROR_WHILE_CREATING_PRODUCT_POLICY,
        { cause: error },
      );
    }
  }

  async findAll(domain: string) {
    if (!domain) {
      throw new BadRequestException(ProductPoliciesErrorKeyEnum.DOMAIN_HEADER_IS_REQUIRED);
    }
    const companyId = await this.resolveCompanyId(domain);

    try {
      return await this.db
        .select()
        .from(product_policies)
        .where(eq(product_policies.company_id, companyId))
        .catch((error) => {
          throw new InternalServerErrorException(ProductPoliciesErrorKeyEnum.FAILED_TO_FETCH_POLICIES, {
            cause: error,
          });
        });
    } catch (error) {
      throw new InternalServerErrorException(ProductPoliciesErrorKeyEnum.FAILED_TO_FETCH_POLICIES, {
        cause: error,
      });
    }
  }

  async findOne(id: string, domain?: string) {
    if (!domain) {
      throw new BadRequestException(ProductPoliciesErrorKeyEnum.DOMAIN_HEADER_IS_REQUIRED);
    }

    const companyId = await this.resolveCompanyId(domain);

    try {
      const [policy] = await this.db
        .select()
        .from(product_policies)
        .where(
          and(
            eq(product_policies.id, id),
            eq(product_policies.company_id, companyId),
          ),
        );

      if (!policy) {
        throw new NotFoundException(
          `Policy with ID ${id} not found or you don't have access to it.`,
        );
      }

      return policy;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        ProductPoliciesErrorKeyEnum.DATABASE_ERROR_WHILE_FETCHING_PRODUCT_POLICY,
        { cause: error },
      );
    }
  }

  async update(id: string, updateDto: UpdateProductPolicyDto, domain: string) {
    if (!domain) {
      throw new BadRequestException(ProductPoliciesErrorKeyEnum.DOMAIN_HEADER_IS_REQUIRED);
    }
    const companyId = await this.resolveCompanyId(domain);

    await this.findOne(id, domain);

    try {
      const [updatedPolicy] = await this.db
        .update(product_policies)
        .set({ ...updateDto })
        .where(
          and(
            eq(product_policies.id, id),
            eq(product_policies.company_id, companyId),
          ),
        )
        .returning();


      return {
        message: 'Product policy updated successfully',
        status: HttpStatus.OK,
        data: updatedPolicy,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      )
        throw error;
      throw new InternalServerErrorException(
        ProductPoliciesErrorKeyEnum.FAILED_TO_UPDATE_PRODUCT_POLICY,
        { cause: error },
      );
    }
  }

  async delete(id: string, domain: string) {
    if (!domain) {
      throw new BadRequestException(ProductPoliciesErrorKeyEnum.DOMAIN_HEADER_IS_REQUIRED);
    }

    const companyId = await this.resolveCompanyId(domain);
    await this.findOne(id, domain);
    try {
      await this.db
        .delete(product_policies)
        .where(
          and(
            eq(product_policies.id, id),
            eq(product_policies.company_id, companyId),
          ),
        );


      return {
        message: 'Product policy deleted successfully',
        status: HttpStatus.OK,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      )
        throw error;
      throw new InternalServerErrorException(
        ProductPoliciesErrorKeyEnum.FAILED_TO_DELETE_PRODUCT_POLICY,
        { cause: error },
      );
    }
  }

  // ==========================================================================
  // CATEGORY POLICY ASSIGNMENT
  // ==========================================================================

  async assignCategoryPolicy(dto: AssignCategoryPolicyDto, domain: string) {
    if (!domain) throw new BadRequestException(ProductPoliciesErrorKeyEnum.DOMAIN_IS_REQUIRED);
    if (!dto.category_id || !dto.policy_id) {
      throw new BadRequestException(ProductPoliciesErrorKeyEnum.CATEGORY_ID_AND_POLICY_ID_ARE_REQUIRED);
    }
    await this.findOne(dto.policy_id, domain);

    try {
      const existingAssignment = await this.db
        .select()
        .from(category_policy)
        .where(
          and(
            eq(category_policy.category_id, dto.category_id),
            eq(category_policy.policy_id, dto.policy_id),
          ),
        );

      if (existingAssignment.length > 0) {
        throw new BadRequestException(
          ProductPoliciesErrorKeyEnum.THIS_POLICY_IS_ALREADY_ASSIGNED_TO_THIS_CATEGORY,
        );
      }

      const [assignment] = await this.db
        .insert(category_policy)
        .values({
          category_id: dto.category_id,
          policy_id: dto.policy_id,
          priority: dto.priority ?? 1,
        })
        .returning();


      return {
        message: 'Policy successfully assigned to category',
        status: HttpStatus.CREATED,
        data: assignment,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(
        ProductPoliciesErrorKeyEnum.FAILED_TO_ASSIGN_CATEGORY_POLICY,
        { cause: error },
      );
    }
  }

  async getCategoryPolicies(categoryId: string) {
    try {
      return await this.db
        .select()
        .from(category_policy)
        .where(eq(category_policy.category_id, categoryId));
    } catch (error) {
      throw new InternalServerErrorException(
        ProductPoliciesErrorKeyEnum.FAILED_TO_FETCH_CATEGORY_POLICIES,
        { cause: error },
      );
    }
  }

  async removeCategoryPolicy(assignmentId: string) {
    try {
      await this.db
        .delete(category_policy)
        .where(eq(category_policy.id, assignmentId));
      return {
        message: 'Category policy unassigned successfully',
        status: HttpStatus.OK,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        ProductPoliciesErrorKeyEnum.FAILED_TO_REMOVE_CATEGORY_POLICY,
        { cause: error },
      );
    }
  }

  // ==========================================================================
  // PRODUCT POLICY OVERRIDE
  // ==========================================================================

  async assignProductPolicyOverride(
    dto: AssignProductPolicyOverrideDto,
    domain: string,
  ) {
    if (!domain) throw new BadRequestException(ProductPoliciesErrorKeyEnum.DOMAIN_IS_REQUIRED);

    await this.findOne(dto.policy_id, domain);

    try {
      const existingOverride = await this.db
        .select()
        .from(product_policy_override)
        .where(
          and(
            eq(product_policy_override.product_id, dto.product_id),
            eq(product_policy_override.policy_id, dto.policy_id),
          ),
        );

      if (existingOverride.length > 0) {
        throw new BadRequestException(
          ProductPoliciesErrorKeyEnum.THIS_POLICY_OVERRIDE_IS_ALREADY_APPLIED_TO_THIS_PRODUCT,
        );
      }

      const [override] = await this.db
        .insert(product_policy_override)
        .values({
          product_id: dto.product_id,
          policy_id: dto.policy_id,
          overrides_category: dto.overrides_category ?? true,
        })
        .returning();


      return {
        message: 'Product policy override applied successfully',
        status: HttpStatus.CREATED,
        data: override,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(
        ProductPoliciesErrorKeyEnum.FAILED_TO_APPLY_PRODUCT_POLICY_OVERRIDE,
        { cause: error },
      );
    }
  }

  async getProductPolicyOverrides(productId: string) {
    try {
      return await this.db
        .select()
        .from(product_policy_override)
        .where(eq(product_policy_override.product_id, productId))
        .catch((error) => {
          throw new InternalServerErrorException(
            ProductPoliciesErrorKeyEnum.FAILED_TO_FETCH_PRODUCT_POLICY_OVERRIDES,
            { cause: error },
          );
        });
    } catch (error) {
      throw new InternalServerErrorException(
        ProductPoliciesErrorKeyEnum.FAILED_TO_FETCH_PRODUCT_POLICY_OVERRIDES,
        { cause: error },
      );
    }
  }

  async removeProductPolicyOverride(overrideId: string) {
    try {
      await this.db
        .delete(product_policy_override)
        .where(eq(product_policy_override.id, overrideId));
      return {
        message: 'Product override removed successfully',
        status: HttpStatus.OK,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        ProductPoliciesErrorKeyEnum.FAILED_TO_REMOVE_PRODUCT_POLICY_OVERRIDE,
        { cause: error },
      );
    }
  }

  // ==========================================================================
  // ORDER ITEM POLICY SNAPSHOT
  // ==========================================================================

  async createOrderItemPolicySnapshot(
    dto: CreateOrderItemPolicySnapshotDto,
    domain: string,
    tx?: DrizzleService,
  ) {
    const db = tx ?? this.db;
    const policy = await this.findOne(dto.policy_id, domain);

    const startDate = new Date(dto.policy_start_date);
    let calculatedEndDate: Date | null = null;

    if (policy.duration_value && policy.duration_unit) {
      calculatedEndDate = new Date(startDate);

      switch (policy.duration_unit) {
        case 'days':
          calculatedEndDate.setDate(
            startDate.getDate() + policy.duration_value,
          );
          break;
        case 'months':
          calculatedEndDate.setMonth(
            startDate.getMonth() + policy.duration_value,
          );
          break;
        case 'years':
          calculatedEndDate.setFullYear(
            startDate.getFullYear() + policy.duration_value,
          );
          break;
        case 'lifetime':
        default:
          calculatedEndDate = null;
          break;
      }
    }

    try {
      const [snapshot] = await db
        .insert(order_item_policy)
        .values({
          policy_id: dto.policy_id,
          order_item_id: dto.order_item_id,
          policy_snapshot: policy,
          policy_start_date: startDate.toISOString().split('T')[0],
          policy_end_date: calculatedEndDate
            ? calculatedEndDate.toISOString().split('T')[0]
            : null,
          document_generated: policy.generates_document ?? false,
          document_url: dto.order_item_policy_document_url,
        })
        .returning()
        .catch((error) => {
          throw new InternalServerErrorException(
            ProductPoliciesErrorKeyEnum.FAILED_TO_CREATE_ORDER_ITEM_POLICY_SNAPSHOT,
            { cause: error },
          );
        });


      return snapshot;
    } catch (error) {
      throw new InternalServerErrorException(
        ProductPoliciesErrorKeyEnum.FAILED_TO_CREATE_ORDER_ITEM_POLICY_SNAPSHOT,
        { cause: error },
      );
    }
  }

  async getOrderItemPolicy(orderItemId: string) {
    try {
      const [policySnapshot] = await this.db
        .select()
        .from(order_item_policy)
        .where(eq(order_item_policy.order_item_id, orderItemId));

      if (!policySnapshot) {
        throw new NotFoundException(
          `No policy found for order item ${orderItemId}`,
        );
      }

      return policySnapshot;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        ProductPoliciesErrorKeyEnum.FAILED_TO_FETCH_ORDER_ITEM_POLICY,
        { cause: error },
      );
    }
  }

  async getCoverageOverview(domain: string, policyId?: string | null) {
    if (!domain) throw new BadRequestException(ProductPoliciesErrorKeyEnum.A_DOMAIN_IS_REQUIRED);
    const companyId = await this.resolveCompanyId(domain);
    const whereCause = [eq(product_policies.company_id, companyId)];
    if (policyId) {
      whereCause.push(eq(product_policies.id, policyId));
    }
    try {
      const policiesRecords = await this.db.query.product_policies
        .findMany({
          where: and(...whereCause),
          with: {
            categoryAssignments: {
              columns: {
                id: true,
                policy_id: true,
                priority: true,
              },
              with: {
                category: {
                  with: {
                    products: {
                      columns: {
                        id: true,
                        name: true,
                      },
                    },
                  },
                },
              },
            },
            productOverrides: {
              columns: {
                id: true,
                policy_id: true,
                overrides_category: true,
              },
              with: {
                product: {
                  columns: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            ProductPoliciesErrorKeyEnum.FAILED_TO_FETCH_COVERAGE_OVERVIEW,
            { cause: error },
          );
        });

      if (!policiesRecords.length) return { data: [] };
      // 2. Map the relational data directly into your frontend structure
      const coverageData = policiesRecords.map((policyRecord) => {
        // Destructure to separate the base policy fields from the joined arrays
        const { categoryAssignments, productOverrides, ...policy } =
          policyRecord;
        const inheritedProducts = categoryAssignments.flatMap((ca) => {
          if (!ca.category || !ca.category.products) return [];

          return ca.category.products.map((p) => ({
            id: p.id,
            name: p.name,
            category_name: ca.category.name,
          }));
        });
        return {
          policy,
          categories: categoryAssignments
            .filter((ca) => ca.category)
            .map((ca) => ({
              id: ca.category.id,
              assignment_id: ca.id,
              name: ca.category.name,
              priority: ca.priority,
            })),
          products: productOverrides
            .filter((po) => po.product)
            .map((po) => ({
              id: po.product.id,
              override_id: po.id,
              name: po.product.name,
              overrides_category: po.overrides_category,
            })),
          inherited_products: inheritedProducts,
        };
      });
      return coverageData;
    } catch (error) {
      throw new InternalServerErrorException(
        ProductPoliciesErrorKeyEnum.FAILED_TO_FETCH_COVERAGE_OVERVIEW,
        { cause: error },
      );
    }
  }

  async getWarrantyUrl(orderId: string) {

    try {
      const warrantyUrls = await this.db.query.orders
        .findMany({
          where: eq(orders.id, orderId),
          columns: {
            id: true,
          },
          with: {
            items: {
              with: {
                policy: {
                  columns: {
                    document_url: true,
                  },
                },
              },
            },
          },
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            ProductPoliciesErrorKeyEnum.FAILED_TO_FETCH_WARRANTY_URL,
            {
              cause: error,
            },
          );
        });
      if (!warrantyUrls || warrantyUrls.length === 0) {
        throw new NotFoundException(`Order with ID ${orderId} not found.`);
      }
      const extractedUrls = warrantyUrls.flatMap(
        (order) =>
          order.items.map((item) => item.policy?.document_url).filter(Boolean), // Removes any undefined/null values if a policy is missing
      );

      return extractedUrls;
    } catch (error) {
      throw new InternalServerErrorException(ProductPoliciesErrorKeyEnum.FAILED_TO_FETCH_WARRANTY_URL, {
        cause: error,
      });
    }
  }

  // ==========================================================================
  // WARRANTY PAYLOAD FOR CLIENT-SIDE PDF GENERATION
  // ==========================================================================

  /**
   * Fetches the order items that have an associated policy snapshot and builds
   * the full PolicyDocumentPayload for each one.
   *
   * The client uses these payloads to render warranty PDFs entirely in-browser
   * (html2canvas + jsPDF) — no Puppeteer / server-side rendering needed.
   */
  async getWarrantyPayload(orderId: string) {

    try {
      // 1. Resolve all order items that have a policy snapshot for this order
      const orderData = await this.db.query.orders.findFirst({
        where: eq(orders.id, orderId),
        columns: { id: true },
        with: {
          items: {
            columns: { id: true },
            with: {
              policy: {
                columns: { order_item_id: true, document_generated: true },
              },
            },
          },
        },
      });

      if (!orderData) {
        throw new NotFoundException(`Order with ID ${orderId} not found.`);
      }

      // 2. Filter to items that actually have a policy attached
      const policyItems = orderData.items.filter((item) => !!item.policy);

      if (policyItems.length === 0) {
        return {
          message: 'No warranty documents found for this order.',
          data: [],
        };
      }


      // 3. Build the full payload for each item (reuses PolicyPayloadBuilderService)
      const payloads = await Promise.all(
        policyItems.map((item) =>
          this.policyPayloadBuilder.buildPayload(item.id),
        ),
      );


      return {
        message: 'Warranty payload(s) fetched successfully',
        data: payloads,
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        ProductPoliciesErrorKeyEnum.FAILED_TO_FETCH_WARRANTY_PAYLOAD,
        { cause: error },
      );
    }
  }
}
