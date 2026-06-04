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

@Injectable()
export class ProductPoliciesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
    private readonly policyPayloadBuilder: PolicyPayloadBuilderService,
  ) {}

  // ─── helpers ──────────────────────────────────────────────────────────────

  private async resolveCompanyId(domain: string): Promise<string> {
    console.log(
      `[ProductPoliciesService.resolveCompanyId] Resolving company for domain: ${domain}`,
    );
    const filterDomain = domainExtractor(domain);
    console.log(
      `[ProductPoliciesService.resolveCompanyId] Extracted filter domain: ${filterDomain}`,
    );
    console.log(
      `[ProductPoliciesService.resolveCompanyId] Querying CompanyService.find(...)`,
    );
    return this.companyService.find(filterDomain);
  }

  // ==========================================================================
  // CRUD
  // ==========================================================================

  async create(createDto: CreateProductPolicyDto, domain?: string) {
    console.log('[ProductPoliciesService.create] Request received');
    console.log('[ProductPoliciesService.create] Incoming payload:', createDto);
    if (!domain) {
      console.log(
        '[ProductPoliciesService.create] Stopping: domain header is missing',
      );
      throw new BadRequestException(
        'A product policy must belong to either a vendor or a company.',
      );
    }

    console.log(
      `[ProductPoliciesService.create] Resolving company id for domain: ${domain}`,
    );
    const companyId = await this.resolveCompanyId(domain);
    console.log(
      `[ProductPoliciesService.create] Company resolved: ${companyId ?? 'null'}`,
    );

    try {
      console.log(
        '[ProductPoliciesService.create] Inserting product policy into database',
      );
      const [newPolicy] = await this.db
        .insert(product_policies)
        .values({
          ...createDto,
          company_id: companyId || null,
          generates_document: createDto.generates_document ?? false,
          is_active: createDto.is_active ?? true,
        })
        .returning();

      console.log(
        '[ProductPoliciesService.create] Insert completed successfully',
        newPolicy,
      );

      return {
        message: 'Product policy created successfully',
        status: HttpStatus.CREATED,
        data: newPolicy,
      };
    } catch (error) {
      console.error(
        '[ProductPoliciesService.create] Failed while inserting product policy',
        error,
      );
      throw new InternalServerErrorException(
        'Database error while creating product policy',
        { cause: error },
      );
    }
  }

  async findAll(domain: string) {
    console.log('[ProductPoliciesService.findAll] Request received');
    if (!domain) {
      console.log(
        '[ProductPoliciesService.findAll] Stopping: domain header is missing',
      );
      throw new BadRequestException('Domain header is required.');
    }
    console.log(
      `[ProductPoliciesService.findAll] Resolving company id for domain: ${domain}`,
    );
    const companyId = await this.resolveCompanyId(domain);

    try {
      console.log(
        `[ProductPoliciesService.findAll] Querying product policies for company_id: ${companyId}`,
      );
      return await this.db
        .select()
        .from(product_policies)
        .where(eq(product_policies.company_id, companyId))
        .catch((error) => {
          console.error(
            '[ProductPoliciesService.findAll] Failed while fetching product policies',
            error,
          );
          throw new InternalServerErrorException('Failed to fetch policies', {
            cause: error,
          });
        });
    } catch (error) {
      console.error(
        '[ProductPoliciesService.findAll] Failed while fetching product policies',
        error,
      );
      throw new InternalServerErrorException('Failed to fetch policies', {
        cause: error,
      });
    }
  }

  async findOne(id: string, domain?: string) {
    console.log(
      `[ProductPoliciesService.findOne] Request received for policy id: ${id}`,
    );
    if (!domain) {
      console.log(
        '[ProductPoliciesService.findOne] Stopping: domain header is missing',
      );
      throw new BadRequestException('Domain header is required.');
    }

    console.log(
      `[ProductPoliciesService.findOne] Resolving company id for domain: ${domain}`,
    );
    const companyId = await this.resolveCompanyId(domain);

    try {
      console.log(
        `[ProductPoliciesService.findOne] Querying policy by id: ${id} and company_id: ${companyId}`,
      );
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
        console.log(
          `[ProductPoliciesService.findOne] No policy found for id: ${id} and company_id: ${companyId}`,
        );
        throw new NotFoundException(
          `Policy with ID ${id} not found or you don't have access to it.`,
        );
      }

      console.log(
        `[ProductPoliciesService.findOne] Policy found for id: ${id}`,
      );
      return policy;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      console.error(
        '[ProductPoliciesService.findOne] Failed while fetching product policy',
        error,
      );
      throw new InternalServerErrorException(
        'Database error while fetching product policy',
        { cause: error },
      );
    }
  }

  async update(id: string, updateDto: UpdateProductPolicyDto, domain: string) {
    console.log(
      `[ProductPoliciesService.update] Request received for policy id: ${id}`,
    );
    console.log('[ProductPoliciesService.update] Update payload:', updateDto);
    if (!domain) {
      console.log(
        '[ProductPoliciesService.update] Stopping: domain header is missing',
      );
      throw new BadRequestException('Domain header is required.');
    }
    console.log(
      `[ProductPoliciesService.update] Resolving company id for domain: ${domain}`,
    );
    const companyId = await this.resolveCompanyId(domain);

    console.log(
      `[ProductPoliciesService.update] Verifying policy exists before update: ${id}`,
    );
    await this.findOne(id, domain);

    try {
      console.log(
        `[ProductPoliciesService.update] Updating policy id: ${id} for company_id: ${companyId}`,
      );
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

      console.log(
        '[ProductPoliciesService.update] Update completed successfully',
        updatedPolicy,
      );

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
      console.error(
        '[ProductPoliciesService.update] Failed while updating product policy',
        error,
      );
      throw new InternalServerErrorException(
        'Failed to update product policy',
        { cause: error },
      );
    }
  }

  async delete(id: string, domain: string) {
    console.log(
      `[ProductPoliciesService.delete] Request received for policy id: ${id}`,
    );
    if (!domain) {
      console.log(
        '[ProductPoliciesService.delete] Stopping: domain header is missing',
      );
      throw new BadRequestException('Domain header is required.');
    }

    console.log(
      `[ProductPoliciesService.delete] Resolving company id for domain: ${domain}`,
    );
    const companyId = await this.resolveCompanyId(domain);
    console.log(
      `[ProductPoliciesService.delete] Verifying policy exists before delete: ${id}`,
    );
    await this.findOne(id, domain);
    try {
      console.log(
        `[ProductPoliciesService.delete] Deleting policy id: ${id} for company_id: ${companyId}`,
      );
      await this.db
        .delete(product_policies)
        .where(
          and(
            eq(product_policies.id, id),
            eq(product_policies.company_id, companyId),
          ),
        );

      console.log(
        `[ProductPoliciesService.delete] Delete completed successfully for policy id: ${id}`,
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
      console.error(
        '[ProductPoliciesService.delete] Failed while deleting product policy',
        error,
      );
      throw new InternalServerErrorException(
        'Failed to delete product policy',
        { cause: error },
      );
    }
  }

  // ==========================================================================
  // CATEGORY POLICY ASSIGNMENT
  // ==========================================================================

  async assignCategoryPolicy(dto: AssignCategoryPolicyDto, domain: string) {
    console.log(
      '[ProductPoliciesService.assignCategoryPolicy] Request received',
    );
    console.log('[ProductPoliciesService.assignCategoryPolicy] Payload:', dto);
    if (!domain) throw new BadRequestException('Domain is required.');
    if (!dto.category_id || !dto.policy_id) {
      console.log(
        '[ProductPoliciesService.assignCategoryPolicy] Stopping: category_id or policy_id is missing',
      );
      throw new BadRequestException('Category ID and Policy ID are required.');
    }
    console.log(
      `[ProductPoliciesService.assignCategoryPolicy] Verifying policy exists: ${dto.policy_id}`,
    );
    await this.findOne(dto.policy_id, domain);

    try {
      console.log(
        `[ProductPoliciesService.assignCategoryPolicy] Checking existing assignment for category_id: ${dto.category_id} and policy_id: ${dto.policy_id}`,
      );
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
        console.log(
          '[ProductPoliciesService.assignCategoryPolicy] Stopping: assignment already exists',
        );
        throw new BadRequestException(
          'This policy is already assigned to this category.',
        );
      }

      console.log(
        '[ProductPoliciesService.assignCategoryPolicy] Inserting category policy assignment',
      );
      const [assignment] = await this.db
        .insert(category_policy)
        .values({
          category_id: dto.category_id,
          policy_id: dto.policy_id,
          priority: dto.priority ?? 1,
        })
        .returning();

      console.log(
        '[ProductPoliciesService.assignCategoryPolicy] Assignment created successfully',
        assignment,
      );

      return {
        message: 'Policy successfully assigned to category',
        status: HttpStatus.CREATED,
        data: assignment,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(
        'Failed to assign category policy',
        { cause: error },
      );
    }
  }

  async getCategoryPolicies(categoryId: string) {
    console.log(
      `[ProductPoliciesService.getCategoryPolicies] Request received for category_id: ${categoryId}`,
    );
    try {
      console.log(
        `[ProductPoliciesService.getCategoryPolicies] Querying category_policy rows for category_id: ${categoryId}`,
      );
      return await this.db
        .select()
        .from(category_policy)
        .where(eq(category_policy.category_id, categoryId));
    } catch (error) {
      console.error(
        '[ProductPoliciesService.getCategoryPolicies] Failed while fetching category policies',
        error,
      );
      throw new InternalServerErrorException(
        'Failed to fetch category policies',
        { cause: error },
      );
    }
  }

  async removeCategoryPolicy(assignmentId: string) {
    console.log(
      `[ProductPoliciesService.removeCategoryPolicy] Request received for assignment id: ${assignmentId}`,
    );
    try {
      console.log(
        `[ProductPoliciesService.removeCategoryPolicy] Deleting assignment id: ${assignmentId}`,
      );
      await this.db
        .delete(category_policy)
        .where(eq(category_policy.id, assignmentId));
      console.log(
        `[ProductPoliciesService.removeCategoryPolicy] Delete completed successfully for assignment id: ${assignmentId}`,
      );
      return {
        message: 'Category policy unassigned successfully',
        status: HttpStatus.OK,
      };
    } catch (error) {
      console.error(
        '[ProductPoliciesService.removeCategoryPolicy] Failed while removing category policy',
        error,
      );
      throw new InternalServerErrorException(
        'Failed to remove category policy',
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
    console.log(
      '[ProductPoliciesService.assignProductPolicyOverride] Request received',
    );
    console.log(
      '[ProductPoliciesService.assignProductPolicyOverride] Payload:',
      dto,
    );
    if (!domain) throw new BadRequestException('Domain is required.');

    console.log(
      `[ProductPoliciesService.assignProductPolicyOverride] Verifying policy exists: ${dto.policy_id}`,
    );
    await this.findOne(dto.policy_id, domain);

    try {
      console.log(
        `[ProductPoliciesService.assignProductPolicyOverride] Checking existing override for product_id: ${dto.product_id} and policy_id: ${dto.policy_id}`,
      );
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
        console.log(
          '[ProductPoliciesService.assignProductPolicyOverride] Stopping: override already exists',
        );
        throw new BadRequestException(
          'This policy override is already applied to this product.',
        );
      }

      console.log(
        '[ProductPoliciesService.assignProductPolicyOverride] Inserting product policy override',
      );
      const [override] = await this.db
        .insert(product_policy_override)
        .values({
          product_id: dto.product_id,
          policy_id: dto.policy_id,
          overrides_category: dto.overrides_category ?? true,
        })
        .returning();

      console.log(
        '[ProductPoliciesService.assignProductPolicyOverride] Override created successfully',
        override,
      );

      return {
        message: 'Product policy override applied successfully',
        status: HttpStatus.CREATED,
        data: override,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(
        'Failed to apply product policy override',
        { cause: error },
      );
    }
  }

  async getProductPolicyOverrides(productId: string) {
    console.log(
      `[ProductPoliciesService.getProductPolicyOverrides] Request received for product_id: ${productId}`,
    );
    try {
      console.log(
        `[ProductPoliciesService.getProductPolicyOverrides] Querying overrides for product_id: ${productId}`,
      );
      return await this.db
        .select()
        .from(product_policy_override)
        .where(eq(product_policy_override.product_id, productId))
        .catch((error) => {
          console.error(
            '[ProductPoliciesService.getProductPolicyOverrides] Failed while fetching product policy overrides',
            error,
          );
          throw new InternalServerErrorException(
            'Failed to fetch product policy overrides',
            { cause: error },
          );
        });
    } catch (error) {
      console.error(
        '[ProductPoliciesService.getProductPolicyOverrides] Failed while fetching product policy overrides',
        error,
      );
      throw new InternalServerErrorException(
        'Failed to fetch product policy overrides',
        { cause: error },
      );
    }
  }

  async removeProductPolicyOverride(overrideId: string) {
    console.log(
      `[ProductPoliciesService.removeProductPolicyOverride] Request received for override id: ${overrideId}`,
    );
    try {
      console.log(
        `[ProductPoliciesService.removeProductPolicyOverride] Deleting override id: ${overrideId}`,
      );
      await this.db
        .delete(product_policy_override)
        .where(eq(product_policy_override.id, overrideId));
      console.log(
        `[ProductPoliciesService.removeProductPolicyOverride] Delete completed successfully for override id: ${overrideId}`,
      );
      return {
        message: 'Product override removed successfully',
        status: HttpStatus.OK,
      };
    } catch (error) {
      console.error(
        '[ProductPoliciesService.removeProductPolicyOverride] Failed while removing product policy override',
        error,
      );
      throw new InternalServerErrorException(
        'Failed to remove product policy override',
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
    console.log(
      '[ProductPoliciesService.createOrderItemPolicySnapshot] Request received',
    );
    console.log(
      '[ProductPoliciesService.createOrderItemPolicySnapshot] Payload:',
      dto,
    );
    console.log(
      `[ProductPoliciesService.createOrderItemPolicySnapshot] Verifying policy exists: ${dto.policy_id}`,
    );
    const policy = await this.findOne(dto.policy_id, domain);

    console.log(
      `[ProductPoliciesService.createOrderItemPolicySnapshot] Calculating snapshot dates starting from: ${dto.policy_start_date}`,
    );
    const startDate = new Date(dto.policy_start_date);
    let calculatedEndDate: Date | null = null;

    if (policy.duration_value && policy.duration_unit) {
      console.log(
        `[ProductPoliciesService.createOrderItemPolicySnapshot] Policy duration detected: ${policy.duration_value} ${policy.duration_unit}`,
      );
      calculatedEndDate = new Date(startDate);

      switch (policy.duration_unit) {
        case 'days':
          console.log(
            '[ProductPoliciesService.createOrderItemPolicySnapshot] Calculating end date in days',
          );
          calculatedEndDate.setDate(
            startDate.getDate() + policy.duration_value,
          );
          break;
        case 'months':
          console.log(
            '[ProductPoliciesService.createOrderItemPolicySnapshot] Calculating end date in months',
          );
          calculatedEndDate.setMonth(
            startDate.getMonth() + policy.duration_value,
          );
          break;
        case 'years':
          console.log(
            '[ProductPoliciesService.createOrderItemPolicySnapshot] Calculating end date in years',
          );
          calculatedEndDate.setFullYear(
            startDate.getFullYear() + policy.duration_value,
          );
          break;
        case 'lifetime':
        default:
          console.log(
            '[ProductPoliciesService.createOrderItemPolicySnapshot] No end date will be stored for lifetime policy',
          );
          calculatedEndDate = null;
          break;
      }
    }

    try {
      console.log(
        '[ProductPoliciesService.createOrderItemPolicySnapshot] Inserting order item policy snapshot',
        dto,
      );
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
          console.error(
            '[ProductPoliciesService.createOrderItemPolicySnapshot] Failed while inserting order item policy snapshot',
            error,
          );
          throw new InternalServerErrorException(
            'Failed to create order item policy snapshot',
            { cause: error },
          );
        });

      console.log(
        '[ProductPoliciesService.createOrderItemPolicySnapshot] Snapshot created successfully',
        snapshot,
      );

      return snapshot;
    } catch (error) {
      console.error(
        '[ProductPoliciesService.createOrderItemPolicySnapshot] Failed while creating order item policy snapshot',
        error,
      );
      throw new InternalServerErrorException(
        'Failed to create order item policy snapshot',
        { cause: error },
      );
    }
  }

  async getOrderItemPolicy(orderItemId: string) {
    console.log(
      `[ProductPoliciesService.getOrderItemPolicy] Request received for order_item_id: ${orderItemId}`,
    );
    try {
      console.log(
        `[ProductPoliciesService.getOrderItemPolicy] Querying order_item_policy for order_item_id: ${orderItemId}`,
      );
      const [policySnapshot] = await this.db
        .select()
        .from(order_item_policy)
        .where(eq(order_item_policy.order_item_id, orderItemId));

      if (!policySnapshot) {
        console.log(
          `[ProductPoliciesService.getOrderItemPolicy] No snapshot found for order_item_id: ${orderItemId}`,
        );
        throw new NotFoundException(
          `No policy found for order item ${orderItemId}`,
        );
      }

      console.log(
        `[ProductPoliciesService.getOrderItemPolicy] Snapshot fetched successfully for order_item_id: ${orderItemId}`,
        policySnapshot,
      );
      return policySnapshot;
    } catch (error) {
      console.error(
        '[ProductPoliciesService.getOrderItemPolicy] Failed while fetching order item policy',
        error,
      );
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        'Failed to fetch order item policy',
        { cause: error },
      );
    }
  }

  async getCoverageOverview(domain: string, policyId?: string | null) {
    if (!domain) throw new BadRequestException('A domain is required.');
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
          console.error(
            '[ProductPoliciesService.getCoverageOverview] Failed while fetching coverage overview',
            error,
          );
          throw new InternalServerErrorException(
            'Failed to fetch coverage overview',
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
      console.log(
        '[ProductPoliciesService.getCoverageOverview] Coverage data fetched:',
        coverageData,
      );
      return coverageData;
    } catch (error) {
      console.error('Error fetching coverage overview:', error);
      throw new InternalServerErrorException(
        'Failed to fetch coverage overview',
        { cause: error },
      );
    }
  }

  async getWarrantyUrl(orderId: string) {
    console.log(
      `[ProductPoliciesService.getWarrantyUrl] Request received for order_id: ${orderId}`,
    );

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
          console.error(
            '[ProductPoliciesService.getWarrantyUrl] Failed while fetching warranty URL',
            error,
          );
          throw new InternalServerErrorException(
            'Failed to fetch warranty URL',
            {
              cause: error,
            },
          );
        });
      if (!warrantyUrls || warrantyUrls.length === 0) {
        console.log(
          `[ProductPoliciesService.getWarrantyUrl] No order found for order_id: ${orderId}`,
        );
        throw new NotFoundException(`Order with ID ${orderId} not found.`);
      }
      const extractedUrls = warrantyUrls.flatMap(
        (order) =>
          order.items.map((item) => item.policy?.document_url).filter(Boolean), // Removes any undefined/null values if a policy is missing
      );

      console.log(extractedUrls);
      return extractedUrls;
    } catch (error) {
      console.error('Error fetching warranty URL:', error);
      throw new InternalServerErrorException('Failed to fetch warranty URL', {
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
    console.log(
      `[ProductPoliciesService.getWarrantyPayload] Request received for order_id: ${orderId}`,
    );

    try {
      // 1. Resolve all order items that have a policy snapshot for this order
      console.log(
        `[ProductPoliciesService.getWarrantyPayload] Querying order items with policy for order_id: ${orderId}`,
      );
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
        console.log(
          `[ProductPoliciesService.getWarrantyPayload] No order found for order_id: ${orderId}`,
        );
        throw new NotFoundException(`Order with ID ${orderId} not found.`);
      }

      // 2. Filter to items that actually have a policy attached
      const policyItems = orderData.items.filter((item) => !!item.policy);

      if (policyItems.length === 0) {
        console.log(
          `[ProductPoliciesService.getWarrantyPayload] No policy items found for order_id: ${orderId}`,
        );
        return {
          message: 'No warranty documents found for this order.',
          data: [],
        };
      }

      console.log(
        `[ProductPoliciesService.getWarrantyPayload] Building payloads for ${policyItems.length} item(s)`,
      );

      // 3. Build the full payload for each item (reuses PolicyPayloadBuilderService)
      const payloads = await Promise.all(
        policyItems.map((item) =>
          this.policyPayloadBuilder.buildPayload(item.id),
        ),
      );

      console.log(
        `[ProductPoliciesService.getWarrantyPayload] Successfully built ${payloads.length} payload(s) for order_id: ${orderId}`,
      );

      return {
        message: 'Warranty payload(s) fetched successfully',
        data: payloads,
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      console.error(
        `[ProductPoliciesService.getWarrantyPayload] Failed for order_id: ${orderId}`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to fetch warranty payload',
        { cause: error },
      );
    }
  }
}
