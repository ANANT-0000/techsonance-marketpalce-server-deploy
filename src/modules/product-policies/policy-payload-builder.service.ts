import {
  Injectable,
  Inject,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import {
  order_item_policy,
  company_branding,
  company,
} from '../../drizzle/schema';
import {
  PolicyDocumentPayload,
  PolicySnapshot,
} from './interfaces/policy-document.interface';
@Injectable()
export class PolicyPayloadBuilderService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleService) {}
  async buildPayload(orderItemId: string): Promise<PolicyDocumentPayload> {
        // 1. Fetch the order item policy snapshot and related data
        const itemPolicy = await this.db.query.order_item_policy.findFirst({
      where: eq(order_item_policy.order_item_id, orderItemId),
      with: {
        orderItem: {
          with: {
            order: {
              with: { customer: true },
            },
            variant: {
              with: {
                product: true,
              },
            },
          },
        },
      },
    });
    if (!itemPolicy) {
      throw new NotFoundException(
        `No policy found for order item ${orderItemId}`,
      );
    }
    
    const { orderItem, policy_snapshot } = itemPolicy;
    const snapshot = policy_snapshot as PolicySnapshot;
    const orderData = orderItem.order;
    if (!orderData?.customer) {
      throw new NotFoundException(
        `Order ${orderData && orderData.id} does not have an associated customer.`,
      );
    }
    const userData = orderData.customer;
    const variantData = orderItem.variant;
    if (!variantData) {
      throw new NotFoundException(
        `Variant data not found for order item ${orderItemId}`,
      );
    }
    // 2. Fetch Company Branding (Assuming company_id exists on order)
    if (!orderData || !orderData.company_id) {
      throw new NotFoundException(
        `Order ${orderData?.id} is not associated with any company.`,
      );
    }
        const [branding] = await this.db
      .select()
      .from(company_branding)
      .where(eq(company_branding.company_id, orderData.company_id))
      .catch((error) => {
        throw new InternalServerErrorException(
          `Failed to fetch branding for company ID ${orderData.company_id}.`,
          {
            cause: error,
          },
        );
      });
    const [companyInfo] = await this.db
      .select()
      .from(company)
      .where(eq(company.id, orderData.company_id))
      .catch((error) => {
        throw new InternalServerErrorException(
          `Company with ID ${orderData.company_id} not found for order ${orderData.id}.`,
          {
            cause: error,
          },
        );
      });
    // 3. Construct and return the Payload
        return {
      meta: {
        documentId: itemPolicy.id,
        issueDate: new Date(),
        orderNumber: orderData.id,
      },
      customer: {
        name: `${userData.first_name} ${userData.last_name}`.trim(),
        email: userData.email,
        phone: userData.phone_number || undefined,
      },
      product: {
        name: variantData.variant_name,
        // sku: orderItem.sku,
        quantity: orderItem.quantity,
        price: orderItem.price.toString(),
      },
      policy: {
        policyName: snapshot.policy_name,
        policyType: snapshot.policy_type,
        startDate: itemPolicy.policy_start_date,
        endDate: itemPolicy.policy_end_date,
        coverageDescription: snapshot.coverage_description,
        exclusions: snapshot.exclusions,
        serviceProvider: snapshot.service_provider,
        claimEmail: snapshot.claim_contact_email,
        claimPhone: snapshot.claim_contact_phone,
        processDescription: snapshot.claim_process_description,
      },
      branding: {
        companyName: companyInfo?.company_name || 'Company',
        logoUrl: branding?.logo_url,
        primaryColor: branding?.primary_color || undefined,
        secondaryColor: branding?.secondary_color || undefined,
        accentColor: branding?.accent_color || undefined,
        fontFamily: branding?.font_family || undefined,
      },
    };
  }
}
