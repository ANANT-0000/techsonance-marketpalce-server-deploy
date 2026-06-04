import { DiscountConfig } from './../../drizzle/types/types';
// finances.service.ts
import {
  Injectable,
  InternalServerErrorException,
  Inject,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  eq,
  desc,
  sql,
  and,
  ilike,
  gte,
  lte,
  asc,
  lt,
  count,
} from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import {
  address,
  company_compliance,
  gst_invoices,
  orders,
  payments,
  product_tax,
  product_variants,
  products,
  tax_profiles,
  tax_slabs,
  tax_types,
  vendor,
} from '../../drizzle/schema';
import { CompanyService } from '../company/company.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { COUNTRIES_COMPLIANCE, getStateByCode } from '../../common/constants';
import { PaymentStatus } from '../../drizzle/types/types';
import { multiplyRoundDivide } from '../promotions/promotion-calculator';
import { CreateTaxSlabDto } from './dto/create-tax-slab.dto';

// ─── helpers ────────────────────────────────────────────────────
export interface LineBreakdown {
  variantId: string;
  quantity: number;
  originalUnitPrice: number; // the price passed in, no mutation
  originalTotal: number; // originalUnitPrice * quantity
  discountApplied: number; // proportional share of discountAmount
  discountedTotal: number; // originalTotal - discountApplied
  discountedUnitPrice: number; // discountedTotal / quantity  ← persist this on order_items
  taxAmount: number; // GST extracted from discountedTotal (tax-inclusive model)
  netAmount: number; // discountedTotal - taxAmount
  cgst: number;
  sgst: number;
  igst: number;
  taxTypeId: string | null;
}
async function getGstComplianceMap(
  db: DrizzleService,
  companyId: string,
): Promise<Map<string, string>> {
  const rows = await db
    .select()
    .from(company_compliance)
    .where(
      and(
        eq(company_compliance.company_id, companyId),
        eq(company_compliance.country_code, 'IN'),
        eq(company_compliance.is_active, true),
      ),
    );
  return new Map(rows.map((r) => [r.field_key, r.field_value]));
}

function groupComplianceAsGstRegistrations(
  rows: (typeof company_compliance.$inferSelect)[],
): GstRegistrationView[] {
  // Find all gst_number rows — one per GST registration
  const gstNumberRows = rows.filter((r) => r.field_key === 'gst_number');

  return gstNumberRows.map((gstRow) => {
    // Find companion rows that share the same valid_until date as this GST
    // (they were inserted together during registration)
    const companions = rows.filter(
      (r) =>
        r.field_key !== 'gst_number' &&
        r.field_key.startsWith('gst_') &&
        r.valid_until === gstRow.valid_until,
    );
    const companionMap = new Map(companions.map((c) => [c.field_key, c]));

    return {
      id: gstRow.id, // use gst_number row id as the registration id
      company_id: gstRow.company_id,
      gst_number: gstRow.field_value,
      state_code: companionMap.get('gst_state_code')?.field_value ?? '',
      registration_type: companionMap.get('gst_reg_type')?.field_value ?? '',
      registration_date:
        companionMap.get('gst_registration_date')?.field_value ?? '',
      effective_from: companionMap.get('gst_effective_from')?.field_value ?? '',
      effective_to: gstRow.valid_until ?? '2099-12-31',
      is_default: companionMap.get('gst_is_default')?.field_value === 'true',
      is_active: gstRow.is_active,
      created_at: gstRow.created_at,
      updated_at: gstRow.updated_at,
    };
  });
}

export interface GstRegistrationView {
  id: string;
  company_id: string;
  gst_number: string;
  state_code: string;
  registration_type: string;
  registration_date: string;
  effective_from: string;
  effective_to: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// ────────────────────────────────────────────────────────────────

@Injectable()
export class FinancesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
  ) {}

  private async resolveCompanyId(domain: string): Promise<string> {
    const filteredDomain = domainExtractor(domain);
    return this.companyService.find(filteredDomain);
  }

  // ── Earnings ────────────────────────────────────────────────
  async getVendorEarnings(
    domain: string,
    filters: {
      search: string;
      limit: number;
      offset: number;
      status: PaymentStatus | undefined;
      date: string;
      sortby: 'asc' | 'desc' | 'highest' | 'lowest';
    },
  ) {
    const { search, offset, status, limit, date, sortby } = filters;

    try {
      console.log('[FinancesService.getVendorEarnings] Request received');
      console.log(
        `[FinancesService.getVendorEarnings] Resolving company for domain: ${domain}`,
      );
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        `[FinancesService.getVendorEarnings] Company resolved: ${companyId}`,
      );

      const whereConditions = [eq(orders.company_id, companyId)];

      // Search
      if (search) {
        whereConditions.push(ilike(orders.id, `%${search}%`));
      }

      // Date
      if (date) {
        const startDate = new Date(date);

        const endDate = new Date(date);
        endDate.setDate(endDate.getDate() + 1);

        whereConditions.push(
          gte(orders.created_at, startDate),
          lt(orders.created_at, endDate),
        );
      }

      // Status
      switch (status?.toLowerCase()) {
        case PaymentStatus.COMPLETED:
          whereConditions.push(
            eq(payments.payment_status, PaymentStatus.COMPLETED),
          );
          break;

        case PaymentStatus.PENDING:
          whereConditions.push(
            eq(payments.payment_status, PaymentStatus.PENDING),
          );
          break;
      }

      // Sort
      let orderByClause = [desc(orders.created_at)];

      switch (sortby) {
        case 'asc':
          orderByClause = [asc(orders.created_at)];
          break;

        case 'desc':
          orderByClause = [desc(orders.created_at)];
          break;

        case 'highest':
          orderByClause = [desc(orders.total_amount)];
          break;

        case 'lowest':
          orderByClause = [asc(orders.total_amount)];
          break;
      }
      console.log(
        '[FinancesService.getVendorEarnings] Fetching total orders count',
      );
      const [totalOrders] = await this.db
        .select({
          total: count(orders.id),
        })
        .from(orders)
        .where(eq(orders.company_id, companyId))
        .catch((err) => {
          console.error(
            '[FinancesService.getVendorEarnings] Error fetching total orders count:',
            err,
          );
          throw new InternalServerErrorException(
            'Failed to fetch total orders count',
            { cause: err },
          );
        });
      console.log(
        `[FinancesService.getVendorEarnings] Fetching order records with limit: ${limit}, offset: ${offset}`,
      );
      const orderRecords = await this.db.query.orders
        .findMany({
          where: and(...whereConditions),
          limit: limit || 10,
          offset: Number(offset) || 0,
          orderBy: orderByClause,
          with: {
            payment: {
              columns: {
                id: true,
                payment_status: true,
                transaction_ref: true,
              },
            },
          },
        })
        .catch((error) => {
          console.error(
            '[FinancesService.getVendorEarnings] Error fetching orders for earnings:',
            error,
          );
          throw new InternalServerErrorException(
            'Failed to fetch orders for earnings',
            {
              cause: error,
            },
          );
        });
      console.log(
        `[FinancesService.getVendorEarnings] Retrieved ${orderRecords.length} order records`,
      );

      const earnings = orderRecords.map((order) => {
        const grossAmount = Number(order.total_amount || 0);

        let earningStatus = PaymentStatus.PENDING;

        const filterStatus: PaymentStatus | undefined =
          order.payment?.payment_status?.toUpperCase() as
            | PaymentStatus
            | undefined;

        if (filterStatus === PaymentStatus.COMPLETED) {
          earningStatus = PaymentStatus.COMPLETED;
        } else if (filterStatus === PaymentStatus.REFUNDED) {
          earningStatus = PaymentStatus.REFUNDED;
        }

        return {
          id: order.payment?.id,
          order_id: order.id,
          net_earning: grossAmount.toFixed(2),
          status: earningStatus,
          created_at: order.created_at,
          transaction_ref: order.payment?.transaction_ref || 'N/A',
        };
      });

      const totalCleared = earnings
        .filter((e) => e.status === PaymentStatus.COMPLETED)
        .reduce((sum, e) => sum + Number(e.net_earning), 0);

      const totalPending = earnings
        .filter((e) => e.status === PaymentStatus.PENDING)
        .reduce((sum, e) => sum + Number(e.net_earning), 0);

      console.log(
        `[FinancesService.getVendorEarnings] Earnings summary: cleared=${totalCleared.toFixed(2)}, pending=${totalPending.toFixed(2)}`,
      );
      const result = {
        total_transactions: totalOrders.total,
        total_cleared_earnings: totalCleared.toFixed(2),
        total_pending_earnings: totalPending.toFixed(2),
        earnings,
      };
      console.log(
        '[FinancesService.getVendorEarnings] Request completed successfully',
      );
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        console.error(
          '[FinancesService.getVendorEarnings] HTTP Exception:',
          error,
        );
        throw error;
      }
      console.error(
        '[FinancesService.getVendorEarnings] Unexpected error:',
        error,
      );
      throw new InternalServerErrorException(
        'Error occurred while fetching company earnings',
        { cause: error },
      );
    }
  }

  async getVendorFinancial(vendorId: string) {
    try {
      console.log(
        `[FinancesService.getVendorFinancial] Request received for vendorId: ${vendorId}`,
      );
      const vendorRecord = await this.db.query.vendor
        .findFirst({
          where: eq(vendor.id, vendorId),
          columns: { company_id: true },
        })
        .catch((err) => {
          console.error(
            '[FinancesService.getVendorFinancial] Error fetching vendor record:',
            err,
          );
          throw new InternalServerErrorException(
            'Failed to fetch vendor record',
            { cause: err },
          );
        });
      if (!vendorRecord?.company_id) {
        console.warn(
          `[FinancesService.getVendorFinancial] Vendor or company not found for vendorId: ${vendorId}`,
        );
        throw new NotFoundException('Vendor or associated company not found');
      }
      console.log(
        `[FinancesService.getVendorFinancial] Vendor company resolved: ${vendorRecord.company_id}`,
      );

      console.log(
        '[FinancesService.getVendorFinancial] Fetching vendor order records',
      );
      const orderRecords = await this.db.query.orders
        .findMany({
          where: eq(orders.company_id, vendorRecord.company_id),
          with: {
            payment: {
              columns: {
                id: true,
                payment_status: true,
                transaction_ref: true,
              },
            },
          },
          orderBy: [desc(orders.created_at)],
        })
        .catch((err) => {
          console.error(
            '[FinancesService.getVendorFinancial] Error fetching order records:',
            err,
          );
          throw new InternalServerErrorException(
            'Failed to fetch vendor order records',
            { cause: err },
          );
        });
      console.log(
        `[FinancesService.getVendorFinancial] Retrieved ${orderRecords.length} order records`,
      );

      const earnings = orderRecords.map((order) => {
        const grossAmount = Number(order.total_amount || 0);
        let earningStatus = PaymentStatus.PENDING;
        if (order.payment) {
          const status: PaymentStatus =
            order.payment.payment_status?.toUpperCase() as PaymentStatus;
          if (status === PaymentStatus.COMPLETED)
            earningStatus = PaymentStatus.COMPLETED;
          else if (status === PaymentStatus.REFUNDED)
            earningStatus = PaymentStatus.REFUNDED;
        }
        return {
          id: order.payment?.id || `calc-${order.id}`,
          order_id: order.id,
          gross_amount: grossAmount.toFixed(2),
          platform_fee: '0.00',
          net_earning:
            earningStatus === PaymentStatus.REFUNDED
              ? '0.00'
              : grossAmount.toFixed(2),
          status: earningStatus,
          created_at: order.created_at,
          transaction_ref: order.payment?.transaction_ref || 'N/A',
        };
      });

      const totalCleared = earnings
        .filter((e) => e.status === PaymentStatus.COMPLETED)
        .reduce((sum, e) => sum + Number(e.net_earning), 0);
      const totalPending = earnings
        .filter((e) => e.status === PaymentStatus.PENDING)
        .reduce((sum, e) => sum + Number(e.net_earning), 0);

      console.log(
        `[FinancesService.getVendorFinancial] Financial summary: cleared=${totalCleared.toFixed(2)}, pending=${totalPending.toFixed(2)}`,
      );
      const result = {
        success: true,
        message: 'Financial ledger retrieved successfully',
        data: {
          total_transactions: earnings.length,
          total_cleared_earnings: totalCleared.toFixed(2),
          total_pending_earnings: totalPending.toFixed(2),
          earnings,
        },
      };
      console.log(
        '[FinancesService.getVendorFinancial] Request completed successfully',
      );
      return result;
    } catch (error) {
      if (error instanceof NotFoundException) {
        console.error('[FinancesService.getVendorFinancial] Not found:', error);
        throw error;
      }
      console.error(
        '[FinancesService.getVendorFinancial] Unexpected error:',
        error,
      );
      throw new InternalServerErrorException(
        'Error occurred while fetching vendor financial ledger',
        { cause: error },
      );
    }
  }

  async getGstRegistrations(
    domain: string,
    filters?: {
      search: string;
      limit: number;
      offset: number;
      status: string | undefined;
      date: string;
      sortby: string;
    },
  ) {
    try {
      console.log(
        `[FinancesService.getGstRegistrations] Request received for domain: ${domain}`,
      );
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        `[FinancesService.getGstRegistrations] Company resolved: ${companyId}`,
      );

      console.log(
        '[FinancesService.getGstRegistrations] Fetching GST registrations from compliance',
      );
      const rows = await this.db
        .select()
        .from(company_compliance)
        .where(
          and(
            eq(company_compliance.company_id, companyId),
            eq(company_compliance.country_code, 'IN'),
            eq(company_compliance.is_active, true),
          ),
        )
        .orderBy(desc(company_compliance.created_at))
        .catch((err) => {
          console.error(
            '[FinancesService.getGstRegistrations] Error fetching GST registrations:',
            err,
          );
          throw new InternalServerErrorException(
            'Failed to fetch GST registrations',
            { cause: err },
          );
        });

      console.log(
        `[FinancesService.getGstRegistrations] Retrieved ${rows.length} compliance rows`,
      );
      const registrations = groupComplianceAsGstRegistrations(rows);
      console.log(
        `[FinancesService.getGstRegistrations] Mapped to ${registrations.length} GST registrations`,
      );
      return { success: true, data: registrations };
    } catch (error) {
      if (error instanceof HttpException) {
        console.error(
          '[FinancesService.getGstRegistrations] HTTP Exception:',
          error,
        );
        throw error;
      }
      console.error(
        '[FinancesService.getGstRegistrations] Unexpected error:',
        error,
      );
      throw new InternalServerErrorException(
        'Failed to fetch GST registrations',
        { cause: error },
      );
    }
  }

  /**
   * POST /finances/gst
   * Stores each GST registration as a set of company_compliance rows:
   *   field_key='gst_number'            → the GSTIN
   *   field_key='gst_state_code'        → 2-digit state code
   *   field_key='gst_reg_type'          → Regular / Composition / etc.
   *   field_key='gst_registration_date' → ISO date string
   *   field_key='gst_effective_from'    → ISO date string
   *   field_key='gst_is_default'        → 'true' | 'false'
   * valid_until on each row = effective_to date.
   */

  /**
   * GET /finances/gst/:id
   * id here is the company_compliance.id of the gst_number row.
   * We fetch all rows with the same valid_until to reconstruct
   * the full registration view.
   */
  async getSingleGstRegistration(id: string, domain: string) {
    try {
      console.log(
        `[FinancesService.getSingleGstRegistration] Request received for id: ${id}, domain: ${domain}`,
      );
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        `[FinancesService.getSingleGstRegistration] Company resolved: ${companyId}`,
      );

      // Fetch the anchor row (gst_number row) by its id
      console.log(
        '[FinancesService.getSingleGstRegistration] Fetching anchor GST registration row',
      );
      const [anchorRow] = await this.db
        .select()
        .from(company_compliance)
        .where(
          and(
            eq(company_compliance.id, id),
            eq(company_compliance.company_id, companyId),
            eq(company_compliance.field_key, 'gst_number'),
          ),
        )
        .limit(1)
        .catch((err) => {
          console.error(
            '[FinancesService.getSingleGstRegistration] Error fetching anchor row:',
            err,
          );
          throw new InternalServerErrorException(
            'Failed to fetch GST registration',
            { cause: err },
          );
        });

      if (!anchorRow) {
        console.warn(
          `[FinancesService.getSingleGstRegistration] Anchor row not found for id: ${id}`,
        );
        return { success: false, data: null };
      }
      console.log(
        `[FinancesService.getSingleGstRegistration] Anchor row found: ${anchorRow.id}`,
      );

      // Fetch all companion rows for this registration (same valid_until)
      console.log(
        '[FinancesService.getSingleGstRegistration] Fetching companion compliance rows',
      );
      const allRows = await this.db
        .select()
        .from(company_compliance)
        .where(
          and(
            eq(company_compliance.company_id, companyId),
            eq(company_compliance.country_code, 'IN'),
            eq(company_compliance.valid_until, anchorRow.valid_until!),
          ),
        )
        .catch((err) => {
          console.error(
            '[FinancesService.getSingleGstRegistration] Error fetching companion rows:',
            err,
          );
          throw new InternalServerErrorException(
            'Failed to fetch GST registration details',
            { cause: err },
          );
        });

      console.log(
        `[FinancesService.getSingleGstRegistration] Retrieved ${allRows.length} compliance rows`,
      );
      const [registration] = groupComplianceAsGstRegistrations(allRows);
      console.log(
        '[FinancesService.getSingleGstRegistration] Registration mapped successfully',
      );
      return { success: true, data: registration ?? null };
    } catch (error) {
      if (error instanceof HttpException) {
        console.error(
          '[FinancesService.getSingleGstRegistration] HTTP Exception:',
          error,
        );
        throw error;
      }
      console.error(
        '[FinancesService.getSingleGstRegistration] Unexpected error:',
        error,
      );
      throw new InternalServerErrorException(
        'Failed to fetch single GST registration',
        { cause: error },
      );
    }
  }

  /**
   * PATCH /finances/gst/:id
   * id is the company_compliance.id of the gst_number row.
   * We update all companion rows identified by their field_key
   * and the original valid_until date.
   */
  // ── Tax Profiles ─────────────────────────────────────────────

  async createTaxProfile(domain: string, data: any) {
    try {
      console.log('[FinancesService.createTaxProfile] Request received');
      console.log(
        `[FinancesService.createTaxProfile] Resolving company for domain: ${domain}`,
      );
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        `[FinancesService.createTaxProfile] Company resolved: ${companyId}`,
      );

      console.log(
        `[FinancesService.createTaxProfile] Creating tax profile with type: ${data.profile_type}`,
      );

      const [newProfile] = await this.db
        .insert(tax_profiles)
        .values({
          company_id: companyId,
          profile_type: data.profile_type,
          is_default: data.is_default ?? false,
        })
        .returning()
        .catch((err) => {
          console.error(
            '[FinancesService.createTaxProfile] Error inserting tax profile:',
            err,
          );
          throw new InternalServerErrorException(
            'Failed to create tax profile',
            { cause: err },
          );
        });

      console.log(
        `[FinancesService.createTaxProfile] Tax profile created: ${newProfile?.id}`,
      );
      return newProfile;
    } catch (error) {
      if (error instanceof HttpException) {
        console.error(
          '[FinancesService.createTaxProfile] HTTP Exception:',
          error,
        );
        throw error;
      }
      console.error(
        '[FinancesService.createTaxProfile] Unexpected error:',
        error,
      );
      throw new InternalServerErrorException('Failed to create tax profile', {
        cause: error,
      });
    }
  }

  async getTaxProfiles(
    domain: string,
    filters: {
      search: string;
      limit: number;
      offset: number;
      status: string | undefined;
      date: string;
      sortby: 'asc' | 'desc' | 'highest' | 'lowest';
    },
  ) {
    try {
      console.log('[FinancesService.getTaxProfiles] Request received');
      console.log(
        `[FinancesService.getTaxProfiles] Resolving company for domain: ${domain}`,
      );
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        `[FinancesService.getTaxProfiles] Company resolved: ${companyId}`,
      );

      const { limit, offset, date, status, search, sortby } = filters;
      console.log(
        `[FinancesService.getTaxProfiles] Fetching tax profiles with limit: ${limit}, offset: ${offset}`,
      );
      const records = await this.db.query.tax_profiles
        .findMany({
          limit: limit,
          offset: offset,
          where: eq(tax_profiles.company_id, companyId),
          orderBy: [desc(tax_profiles.created_at)],
        })
        .catch((err) => {
          console.error(
            '[FinancesService.getTaxProfiles] Error fetching tax profiles:',
            err,
          );
          throw new InternalServerErrorException(
            'Failed to fetch tax profiles',
            { cause: err },
          );
        });

      console.log(
        `[FinancesService.getTaxProfiles] Retrieved ${records.length} tax profiles`,
      );
      return records;
    } catch (error) {
      if (error instanceof HttpException) {
        console.error(
          '[FinancesService.getTaxProfiles] HTTP Exception:',
          error,
        );
        throw error;
      }
      console.error(
        '[FinancesService.getTaxProfiles] Unexpected error:',
        error,
      );
      throw new InternalServerErrorException('Failed to fetch tax profiles', {
        cause: error,
      });
    }
  }

  async updateTaxProfile(id: string, domain: string, data: any) {
    try {
      console.log(
        `[FinancesService.updateTaxProfile] Request received for id: ${id}`,
      );
      console.log(
        `[FinancesService.updateTaxProfile] Resolving company for domain: ${domain}`,
      );
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        `[FinancesService.updateTaxProfile] Company resolved: ${companyId}`,
      );

      console.log(
        `[FinancesService.updateTaxProfile] Updating tax profile with profile_type: ${data.profile_type}`,
      );
      const [updated] = await this.db
        .update(tax_profiles)
        .set({
          profile_type: data.profile_type,
          is_default: data.is_default,
        })
        .where(
          and(eq(tax_profiles.id, id), eq(tax_profiles.company_id, companyId)),
        )
        .returning()
        .catch((err) => {
          console.error(
            '[FinancesService.updateTaxProfile] Error updating tax profile:',
            err,
          );
          throw new InternalServerErrorException(
            'Failed to update tax profile',
            { cause: err },
          );
        });

      if (!updated) {
        console.warn(
          `[FinancesService.updateTaxProfile] Tax profile not found for id: ${id}`,
        );
        throw new NotFoundException('Tax profile not found');
      }

      console.log(
        `[FinancesService.updateTaxProfile] Tax profile updated: ${updated?.id}`,
      );
      return updated;
    } catch (error) {
      if (error instanceof HttpException) {
        console.error(
          '[FinancesService.updateTaxProfile] HTTP Exception:',
          error,
        );
        throw error;
      }
      console.error(
        '[FinancesService.updateTaxProfile] Unexpected error:',
        error,
      );
      throw new InternalServerErrorException('Failed to update tax profile', {
        cause: error,
      });
    }
  }

  // ── Tax Rates ────────────────────────────────────────────────
  // ── Get single Tax Profile ───────────────────────────────────────
  async getSingleTaxProfile(id: string, domain: string) {
    const companyId = await this.resolveCompanyId(domain);
    const record = await this.db.query.tax_profiles.findFirst({
      where: and(
        eq(tax_profiles.id, id),
        eq(tax_profiles.company_id, companyId),
      ),
    });
    if (!record) throw new NotFoundException('Tax profile not found');
    return { success: true, data: record };
  }

  // ── Create Tax Slab (tax_type + tax_slab together) ───────────────
  async createTaxSlab(domain: string, data: CreateTaxSlabDto) {
    const companyId = await this.resolveCompanyId(domain);

    // Step 1: insert tax_type (semantic definition)
    const [newTaxType] = await this.db
      .insert(tax_types)
      .values({
        company_id: companyId,
        tax_profile_id: data.tax_profile_id,
        tax_name: data.tax_name,
        tax_code: data.tax_code,
        tax_scope: data.tax_scope,
      })
      .returning()
      .catch((err) => {
        console.error('[createTaxSlab] Failed to insert tax_type:', err);
        throw new InternalServerErrorException('Failed to create tax type', {
          cause: err,
        });
      });

    const [newTaxSlab] = await this.db
      .insert(tax_slabs)
      .values({
        company_id: companyId,
        tax_type_id: newTaxType.id,
        slab_name: data.slab_name, // "GST 18% — Electronics"
        total_rate: data.total_rate, // the single total %, e.g. 18.00
        is_exempt: data.is_exempt ?? false,
        effective_from: new Date(data.effective_from)
          .toISOString()
          .split('T')[0],
        effective_to: data.effective_to
          ? new Date(data.effective_to).toISOString().split('T')[0]
          : '2099-12-31',
      })
      .returning()
      .catch((err) => {
        console.error('[createTaxSlab] Failed to insert tax_slab:', err);
        throw new InternalServerErrorException('Failed to create tax slab', {
          cause: err,
        });
      });

    return { taxType: newTaxType, taxSlab: newTaxSlab };
  }

  // ── Get Tax Slabs (list) ─────────────────────────────────────────
  async getTaxSlabs(
    domain: string,
    filters: {
      search: string;
      limit: number;
      offset: number;
      status: string | undefined;
      date: string;
      sortby: 'asc' | 'desc';
    },
  ) {
    const companyId = await this.resolveCompanyId(domain);

    // Join with tax_types to return everything the frontend needs in one call
    const records = await this.db
      .select({
        id: tax_slabs.id,
        slab_name: tax_slabs.slab_name,
        total_rate: tax_slabs.total_rate,
        is_exempt: tax_slabs.is_exempt,
        effective_from: tax_slabs.effective_from,
        effective_to: tax_slabs.effective_to,
        created_at: tax_slabs.created_at,
        // tax_type fields
        tax_name: tax_types.tax_name,
        tax_code: tax_types.tax_code,
        tax_scope: tax_types.tax_scope,
        tax_profile_id: tax_types.tax_profile_id,
      })
      .from(tax_slabs)
      .innerJoin(tax_types, eq(tax_slabs.tax_type_id, tax_types.id))
      .where(eq(tax_slabs.company_id, companyId))
      .orderBy(
        filters.sortby === 'asc'
          ? asc(tax_slabs.created_at)
          : desc(tax_slabs.created_at),
      );

    return records;
  }

  // ── Get single Tax Slab ──────────────────────────────────────────
  async getSingleTaxSlab(id: string, domain: string) {
    const companyId = await this.resolveCompanyId(domain);

    const [record] = await this.db
      .select({
        id: tax_slabs.id,
        slab_name: tax_slabs.slab_name,
        total_rate: tax_slabs.total_rate,
        is_exempt: tax_slabs.is_exempt,
        effective_from: tax_slabs.effective_from,
        effective_to: tax_slabs.effective_to,
        // tax_type fields (needed to pre-fill the form in edit mode)
        tax_name: tax_types.tax_name,
        tax_code: tax_types.tax_code,
        tax_scope: tax_types.tax_scope,
        tax_profile_id: tax_types.tax_profile_id,
        tax_type_id: tax_slabs.tax_type_id,
      })
      .from(tax_slabs)
      .innerJoin(tax_types, eq(tax_slabs.tax_type_id, tax_types.id))
      .where(and(eq(tax_slabs.id, id), eq(tax_slabs.company_id, companyId)))
      .limit(1);

    if (!record) throw new NotFoundException('Tax slab not found');
    return { success: true, data: record };
  }

  // ── Update Tax Slab ──────────────────────────────────────────────
  async updateTaxSlab(id: string, domain: string, data: any) {
    const companyId = await this.resolveCompanyId(domain);

    // Fetch existing slab to get the linked tax_type_id
    const [existing] = await this.db
      .select({ tax_type_id: tax_slabs.tax_type_id })
      .from(tax_slabs)
      .where(and(eq(tax_slabs.id, id), eq(tax_slabs.company_id, companyId)))
      .limit(1);

    if (!existing) throw new NotFoundException('Tax slab not found');

    // Update tax_type (semantic fields) if provided
    if (
      existing.tax_type_id &&
      (data.tax_name || data.tax_code || data.tax_scope || data.tax_profile_id)
    ) {
      await this.db
        .update(tax_types)
        .set({
          ...(data.tax_name && { tax_name: data.tax_name }),
          ...(data.tax_code && { tax_code: data.tax_code }),
          ...(data.tax_scope && { tax_scope: data.tax_scope }),
          ...(data.tax_profile_id && { tax_profile_id: data.tax_profile_id }),
        })
        .where(eq(tax_types.id, existing.tax_type_id))
        .catch((err) => {
          throw new InternalServerErrorException('Failed to update tax type', {
            cause: err,
          });
        });
    }

    // Update tax_slab (numeric fields)
    const [updated] = await this.db
      .update(tax_slabs)
      .set({
        ...(data.slab_name && { slab_name: data.slab_name }),
        ...(data.tax_rate_value !== undefined && {
          total_rate: data.tax_rate_value,
        }),
        ...(data.is_exempt !== undefined && { is_exempt: data.is_exempt }),
        ...(data.effective_from && {
          effective_from: new Date(data.effective_from)
            .toISOString()
            .split('T')[0],
        }),
        ...(data.effective_to && {
          effective_to: new Date(data.effective_to).toISOString().split('T')[0],
        }),
      })
      .where(and(eq(tax_slabs.id, id), eq(tax_slabs.company_id, companyId)))
      .returning()
      .catch((err) => {
        throw new InternalServerErrorException('Failed to update tax slab', {
          cause: err,
        });
      });

    return updated;
  }

  async getTaxRateOptions(domain: string) {
    try {
      console.log('[FinancesService.getTaxRateOptions] Request received');
      console.log(
        `[FinancesService.getTaxRateOptions] Resolving company for domain: ${domain}`,
      );
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        `[FinancesService.getTaxRateOptions] Company resolved: ${companyId}`,
      );

      console.log(
        '[FinancesService.getTaxRateOptions] Fetching tax rate options',
      );
      const options = await this.db.query.tax_slabs
        .findMany({
          where: eq(tax_slabs.company_id, companyId),
          columns: { id: true, slab_name: true },
        })
        .catch((err) => {
          console.error(
            '[FinancesService.getTaxRateOptions] Error fetching tax rate options:',
            err,
          );
          throw new InternalServerErrorException(
            'Failed to fetch tax rate options',
            { cause: err },
          );
        });

      console.log(
        `[FinancesService.getTaxRateOptions] Retrieved ${options.length} tax rate options`,
      );
      return options;
    } catch (error) {
      if (error instanceof HttpException) {
        console.error(
          '[FinancesService.getTaxRateOptions] HTTP Exception:',
          error,
        );
        throw error;
      }
      console.error(
        '[FinancesService.getTaxRateOptions] Unexpected error:',
        error,
      );
      throw new InternalServerErrorException(
        'Failed to fetch tax rate options',
        { cause: error },
      );
    }
  }

  // ── Product Tax Mapping ──────────────────────────────────────

  async getProductTaxMapping(
    domain: string,
    filters?: {
      search: string;
      limit: number;
      offset: number;
      status: string | undefined;
      date: string;
      sortby: string;
    },
  ) {
    try {
      console.log('[FinancesService.getProductTaxMapping] Request received');
      console.log(
        `[FinancesService.getProductTaxMapping] Resolving company for domain: ${domain}`,
      );
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        `[FinancesService.getProductTaxMapping] Company resolved: ${companyId}`,
      );

      console.log(
        '[FinancesService.getProductTaxMapping] Fetching product tax mappings',
      );
      const mappedData = await this.db
        .select({
          id: products.id,
          product_name: products.name,
          sku: sql<string>`MAX(${product_variants.sku})`,
          tax_slabs: tax_slabs.slab_name,
          tax_rate: tax_slabs.total_rate,
          is_mapped: product_tax.id,
          updated_at: product_tax.updated_at,
        })
        .from(products)
        .leftJoin(
          product_variants,
          eq(products.id, product_variants.product_id),
        )
        .leftJoin(product_tax, eq(products.id, product_tax.product_id))
        .leftJoin(tax_slabs, eq(product_tax.tax_slab_id, tax_slabs.id))
        .where(eq(products.company_id, companyId))
        .groupBy(
          products.id,
          products.name,
          tax_slabs.slab_name,
          tax_slabs.total_rate,
          product_tax.id,
          product_tax.updated_at,
        )
        .catch((error) => {
          console.error(
            '[FinancesService.getProductTaxMapping] Error fetching product tax mappings:',
            error,
          );
          throw new InternalServerErrorException(
            'Failed to get product tax mapping',
            {
              cause: error,
            },
          );
        });
      console.log(
        `[FinancesService.getProductTaxMapping] Retrieved  product tax mappings`,
        mappedData,
      );
      console.log(
        `[FinancesService.getProductTaxMapping] Retrieved ${mappedData.length} product tax mappings`,
      );
      return mappedData.map((item) => ({
        ...item,
        sku: item.sku || 'No SKU assigned',
        is_mapped: !!item.is_mapped,
      }));
    } catch (error) {
      if (error instanceof HttpException) {
        console.error(
          '[FinancesService.getProductTaxMapping] HTTP Exception:',
          error,
        );
        throw error;
      }
      console.error(
        '[FinancesService.getProductTaxMapping] Unexpected error:',
        error,
      );
      throw new InternalServerErrorException(
        'Failed to get product tax mapping',
        {
          cause: error,
        },
      );
    }
  }

  async assignTaxToProduct(
    domain: string,
    data: { product_id: string; tax_slab_id: string },
  ) {
    try {
      console.log('[FinancesService.assignTaxToProduct] Request received');
      console.log(
        `[FinancesService.assignTaxToProduct] Resolving company for domain: ${domain}`,
      );
      await this.resolveCompanyId(domain);
      console.log(
        `[FinancesService.assignTaxToProduct] Assigning tax to product: ${data.product_id}`,
      );

      console.log(
        `[FinancesService.assignTaxToProduct] Checking existing mapping for slab: ${data.tax_slab_id}`,
      );
      const existingMapping = await this.db.query.product_tax
        .findFirst({
          where: eq(product_tax.product_id, data.product_id),
        })
        .catch((err) => {
          console.error(
            '[FinancesService.assignTaxToProduct] Error checking existing mapping:',
            err,
          );
          throw new InternalServerErrorException(
            'Failed to check product tax mapping',
            { cause: err },
          );
        });

      if (existingMapping) {
        console.log(
          `[FinancesService.assignTaxToProduct] Updating existing mapping: ${existingMapping.id}`,
        );
        const updated = await this.db
          .update(product_tax)
          .set({ tax_slab_id: data.tax_slab_id })
          .where(eq(product_tax.id, existingMapping.id))
          .returning()
          .catch((err) => {
            console.error(
              '[FinancesService.assignTaxToProduct] Error updating tax mapping:',
              err,
            );
            throw new InternalServerErrorException(
              'Failed to update product tax mapping',
              { cause: err },
            );
          });
        console.log(
          '[FinancesService.assignTaxToProduct] Tax mapping updated successfully',
        );
        return updated;
      }

      console.log(
        `[FinancesService.assignTaxToProduct] Creating new mapping for product: ${data.product_id}`,
      );
      const inserted = await this.db
        .insert(product_tax)
        .values({
          product_id: data.product_id,
          tax_slab_id: data.tax_slab_id,
        })
        .returning()
        .catch((err) => {
          console.error(
            '[FinancesService.assignTaxToProduct] Error inserting tax mapping:',
            err,
          );
          throw new InternalServerErrorException(
            'Failed to assign tax to product',
            { cause: err },
          );
        });

      console.log(
        '[FinancesService.assignTaxToProduct] Tax mapping created successfully',
      );
      return inserted;
    } catch (error) {
      if (error instanceof HttpException) {
        console.error(
          '[FinancesService.assignTaxToProduct] HTTP Exception:',
          error,
        );
        throw error;
      }
      console.error(
        '[FinancesService.assignTaxToProduct] Unexpected error:',
        error,
      );
      throw new InternalServerErrorException(
        'Failed to assign tax to product',
        {
          cause: error,
        },
      );
    }
  }

  async bulkAssignProductTax(
    domain: string,
    data: { product_ids: string[]; tax_slab_id: string },
  ) {
    try {
      console.log('[FinancesService.bulkAssignProductTax] Request received');
      console.log(
        `[FinancesService.bulkAssignProductTax] Resolving company for domain: ${domain}`,
      );
      await this.resolveCompanyId(domain);

      if (!data.product_ids.length) {
        console.warn(
          '[FinancesService.bulkAssignProductTax] No product IDs provided',
        );
        return { success: false, message: 'No product IDs provided' };
      }

      console.log(
        `[FinancesService.bulkAssignProductTax] Assigning tax to ${data.product_ids.length} products`,
      );
      const results = await this.db
        .insert(product_tax)
        .values(
          data.product_ids.map((id) => ({
            product_id: id,
            tax_slab_id: data.tax_slab_id,
          })),
        )
        .onConflictDoUpdate({
          target: product_tax.product_id,
          set: { tax_slab_id: data.tax_slab_id },
        })
        .returning()
        .catch((err) => {
          console.error(
            '[FinancesService.bulkAssignProductTax] Error bulk assigning tax:',
            err,
          );
          throw new InternalServerErrorException(
            'Failed to bulk assign product tax',
            { cause: err },
          );
        });

      console.log(
        `[FinancesService.bulkAssignProductTax] Successfully assigned tax to ${results.length} products`,
      );
      return results;
    } catch (error) {
      if (error instanceof HttpException) {
        console.error(
          '[FinancesService.bulkAssignProductTax] HTTP Exception:',
          error,
        );
        throw error;
      }
      console.error(
        '[FinancesService.bulkAssignProductTax] Unexpected error:',
        error,
      );
      throw new InternalServerErrorException(
        'Failed to bulk assign product tax',
        { cause: error },
      );
    }
  }

  // ── GST Invoices ─────────────────────────────────────────────

  async getGstInvoices(
    domain: string,
    filters: {
      offset: number;
      limit: number;
      search: string;
      date: string;
      sortBy: 'asc' | 'desc';
    } = {
      limit: 10,
      offset: 0,
      search: '',
      date: '',
      sortBy: 'desc',
    },
  ) {
    try {
      const { search, date, sortBy } = filters;
      console.log('[FinancesService.getGstInvoices] Request received');
      console.log(
        `[FinancesService.getGstInvoices] Resolving company for domain: ${domain}`,
      );
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        `[FinancesService.getGstInvoices] Company resolved: ${companyId}`,
      );
      console.log('[FinancesService.getGstInvoices] Applied filters:', {
        search,
        date,
        sortBy,
        limit: filters.limit,
        offset: filters.offset,
      });

      const conditions = [eq(gst_invoices.company_id, companyId)];

      if (search?.trim()) {
        console.log(
          `[FinancesService.getGstInvoices] Applying search filter: ${search.trim()}`,
        );
        conditions.push(
          ilike(gst_invoices.invoice_number, `%${search.trim()}%`),
        );
      }

      if (date) {
        const parsedDate = new Date(date);
        console.log(
          `[FinancesService.getGstInvoices] Parsed date for filtering: ${parsedDate}`,
        );
        if (!Number.isNaN(parsedDate.getTime())) {
          // conditions.push(
          //   eq(gst_invoices.invoice_date, parsedDate.toISOString().slice(0, 10)),
          // );
        }
      }

      console.log(
        '[FinancesService.getGstInvoices] Fetching total invoice count',
      );
      const [totalInvoices] = await this.db
        .select({ count: count(gst_invoices.id) })
        .from(gst_invoices)
        .where(eq(gst_invoices.company_id, companyId));
      console.log('Total GST invoices matching filters:', totalInvoices.count);
      const records = await this.db.query.gst_invoices
        .findMany({
          where: and(...conditions),
          limit: filters.limit,
          offset: filters.offset,
          orderBy: [
            sortBy === 'asc'
              ? asc(gst_invoices.invoice_date)
              : desc(gst_invoices.invoice_date),
          ],
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            'Error fetching GST invoices: ' + error,
          );
        });
      console.log(`Retrieved ${records.length} GST invoices from DB`);
      console.log('Sample record:', records);
      return {
        invoices: records,
        total: totalInvoices.count,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        console.error(
          '[FinancesService.getGstInvoices] HTTP Exception:',
          error,
        );
        throw error;
      }
      console.error(
        '[FinancesService.getGstInvoices] Unexpected error:',
        error,
      );
      throw new InternalServerErrorException('Failed to fetch GST invoices', {
        cause: error,
      });
    }
  }

  // ── Tax Calculation ──────────────────────────────────────────

  /**
   * Replaces the old `gst_registrations.state_code` lookup with
   * a company_compliance query for field_key = 'gst_state_code'
   * where field_key = 'gst_is_default' = 'true'.
   */
  async calculateOrderTaxes(
    customerAddressId: string,
    cartItems: { variantId: string; quantity: number; price: number }[],
    discountAmount: number = 0,
    transaction?: DrizzleService,
    company_id?: string,
    domain?: string,
  ) {
    try {
      console.log('[FinancesService.calculateOrderTaxes] Request received');
      console.log(
        `[FinancesService.calculateOrderTaxes] Calculating taxes for ${cartItems.length} cart items`,
      );
      console.log(
        `[FinancesService.calculateOrderTaxes] Customer address: ${customerAddressId}, discount: ${discountAmount}`,
      );
      const companyId = domain
        ? await this.resolveCompanyId(domain)
        : company_id;
      const tx = transaction ?? this.db;

      if (!companyId) {
        throw new HttpException(
          'Company ID is required for tax calculation',
          HttpStatus.BAD_REQUEST,
        );
      }

      // 1. Customer state
      console.log(
        `[FinancesService.calculateOrderTaxes] Fetching customer address for ID: ${customerAddressId}`,
      );
      const [customerAddr] = await tx
        .select({ state: address.state })
        .from(address)
        .where(eq(address.id, customerAddressId))
        .limit(1)
        .catch((err) => {
          console.error(
            `[FinancesService.calculateOrderTaxes] Error fetching customer address:`,
            err,
          );
          throw new HttpException(
            'Error fetching customer address',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        });

      if (!customerAddr?.state) {
        console.error(
          `[FinancesService.calculateOrderTaxes] Invalid customer address or missing state for ID: ${customerAddressId}`,
        );
        throw new HttpException(
          'Invalid customer address or missing state',
          HttpStatus.BAD_REQUEST,
        );
      }
      const customerState = customerAddr.state.trim().toLowerCase();
      console.log(
        `[FinancesService.calculateOrderTaxes] Customer state resolved: ${customerState}`,
      );

      console.log(
        '[FinancesService.calculateOrderTaxes] Fetching company compliance details',
      );
      const [countryCompliance] = await tx
        .select()
        .from(company_compliance)
        .where(eq(company_compliance.company_id, companyId))
        .catch((error) => {
          console.error(
            '[FinancesService.calculateOrderTaxes] Error fetching company compliance:',
            error,
          );
          throw new HttpException(
            'Error fetching company compliance',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        });

      const fields = COUNTRIES_COMPLIANCE.find(
        (c) => c.country_code === countryCompliance.country_code,
      )?.fields;
      if (!fields) {
        console.error(
          `[FinancesService.calculateOrderTaxes] Country compliance config not found for country: ${countryCompliance.country_code}`,
        );
        throw new HttpException(
          'Country compliance config not found.',
          HttpStatus.BAD_REQUEST,
        );
      }
      console.log(
        `[FinancesService.calculateOrderTaxes] Country compliance found: ${countryCompliance.country_code}`,
      );

      const gstField = fields.find(
        (f) => f.is_primary_tax_id || f.value === 'gstin',
      );
      if (!gstField?.value) {
        console.error(
          '[FinancesService.calculateOrderTaxes] GST field config missing',
        );
        throw new HttpException(
          'GST field config missing.',
          HttpStatus.BAD_REQUEST,
        );
      }
      console.log(
        `[FinancesService.calculateOrderTaxes] GST field identified: ${gstField.value}`,
      );

      console.log(
        '[FinancesService.calculateOrderTaxes] Fetching vendor GST registration',
      );
      const [gstNumberRow] = await tx
        .select()
        .from(company_compliance)
        .where(
          and(
            eq(company_compliance.company_id, companyId),
            eq(company_compliance.field_key, gstField.value),
            eq(company_compliance.is_active, true),
          ),
        )
        .catch((error) => {
          console.error(
            '[FinancesService.calculateOrderTaxes] Error fetching vendor GST number:',
            error,
          );
          throw new HttpException(
            'Error fetching vendor GST number',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        });

      if (!gstNumberRow?.field_value) {
        console.error(
          '[FinancesService.calculateOrderTaxes] Vendor GST number is missing',
        );
        throw new HttpException(
          'Vendor GST number is missing.',
          HttpStatus.BAD_REQUEST,
        );
      }
      console.log(
        `[FinancesService.calculateOrderTaxes] Vendor GST: ${gstNumberRow.field_value}`,
      );

      const stateCode = gstNumberRow.field_value.slice(0, 2);
      if (!stateCode) {
        console.error(
          '[FinancesService.calculateOrderTaxes] Vendor GST state code is missing',
        );
        throw new HttpException(
          'Vendor GST state code is missing.',
          HttpStatus.BAD_REQUEST,
        );
      }
      const vendorState = getStateByCode(stateCode)?.state.trim().toLowerCase();
      const isIntraState = customerState === vendorState;
      console.log(
        `[FinancesService.calculateOrderTaxes] Vendor state: ${vendorState}, intra-state: ${isIntraState}`,
      );
      // 2. Pre-compute base total once (used for proportional discount splitting)
      const baseTotal = cartItems.reduce(
        (sum, item) => sum + Number(item.price) * item.quantity,
        0,
      );
      console.log(
        `[FinancesService.calculateOrderTaxes] Base total calculated: ${baseTotal}`,
      );

      // 3. Per-line breakdown — this is the single source of truth for all
      //    downstream consumers (tax aggregates + order item insertion)

      let totalCgst = 0;
      let totalSgst = 0;
      let totalIgst = 0;
      let totalTax = 0;
      let netSubTotal = 0;
      const appliedTaxTypeIds = new Set<string>();
      const lineBreakdown: LineBreakdown[] = [];

      console.log(
        `[FinancesService.calculateOrderTaxes] Starting line-by-line tax breakdown for ${cartItems.length} items`,
      );
      for (const item of cartItems) {
        console.log(
          `[FinancesService.calculateOrderTaxes] Processing variant: ${item.variantId}, qty: ${item.quantity}, price: ${item.price}`,
        );
        const originalUnitPrice = Number(item.price);
        const originalTotal = originalUnitPrice * item.quantity;

        // Proportionally split the order-level discount across lines
        const lineShare = baseTotal > 0 ? originalTotal / baseTotal : 0;
        const discountApplied = discountAmount * lineShare;
        const discountedTotal = originalTotal - discountApplied;

        // discountedUnitPrice is what gets stored on the order_item row
        const discountedUnitPrice =
          item.quantity > 0
            ? multiplyRoundDivide(discountedTotal / item.quantity)
            : 0;

        // Resolve tax rate for this variant
        console.log(
          `[FinancesService.calculateOrderTaxes] Fetching product variant: ${item.variantId}`,
        );
        const [variantRecord] = await tx
          .select({ product_id: product_variants.product_id })
          .from(product_variants)
          .where(eq(product_variants.id, item.variantId))
          .catch((err) => {
            console.error(
              `[FinancesService.calculateOrderTaxes] Error fetching variant ${item.variantId}:`,
              err,
            );
            throw new HttpException(
              `Error fetching product variant: ${item.variantId}`,
              HttpStatus.INTERNAL_SERVER_ERROR,
            );
          });

        if (!variantRecord?.product_id) {
          console.error(
            `[FinancesService.calculateOrderTaxes] Product variant not found: ${item.variantId}`,
          );
          throw new HttpException(
            `Product variant not found for ID: ${item.variantId}`,
            HttpStatus.BAD_REQUEST,
          );
        }

        console.log(
          `[FinancesService.calculateOrderTaxes] Fetching tax mapping for product: ${variantRecord.product_id}`,
        );
        const [productTaxMapping] = await tx
          .select({
            totalRate: tax_slabs.total_rate,
            isExempt: tax_slabs.is_exempt,
            taxTypeId: tax_slabs.tax_type_id,
          })
          .from(product_tax)
          .leftJoin(tax_slabs, eq(product_tax.tax_slab_id, tax_slabs.id))
          .where(eq(product_tax.product_id, variantRecord.product_id))
          .limit(1)
          .catch((error) => {
            console.error(
              `[FinancesService.calculateOrderTaxes] Error fetching tax mapping for product ${variantRecord.product_id}:`,
              error,
            );
            throw new HttpException(
              'Error fetching tax mapping for product',
              HttpStatus.INTERNAL_SERVER_ERROR,
            );
          });

        const taxPercentage = productTaxMapping
          ? Number(productTaxMapping.totalRate)
          : 0;
        const taxTypeId = productTaxMapping?.taxTypeId ?? null;
        if (taxTypeId) appliedTaxTypeIds.add(taxTypeId);
        console.log(
          `[FinancesService.calculateOrderTaxes] Variant tax rate: ${taxPercentage}%, type: ${taxTypeId}`,
        );

        // Tax extraction from tax-inclusive discounted total
        // Formula: taxAmount = discountedTotal - discountedTotal / (1 + rate/100)
        const taxAmount =
          discountedTotal - discountedTotal / (1 + taxPercentage / 100);
        const netAmount = discountedTotal - taxAmount;

        const cgst = isIntraState ? taxAmount / 2 : 0;
        const sgst = isIntraState ? taxAmount / 2 : 0;
        const igst = !isIntraState ? taxAmount : 0;

        console.log(
          `[FinancesService.calculateOrderTaxes] Line tax calculated: CGST=${cgst.toFixed(2)}, SGST=${sgst.toFixed(2)}, IGST=${igst.toFixed(2)}`,
        );

        totalCgst += cgst;
        totalSgst += sgst;
        totalIgst += igst;
        totalTax += taxAmount;
        netSubTotal += netAmount;

        lineBreakdown.push({
          variantId: item.variantId,
          quantity: item.quantity,
          originalUnitPrice,
          originalTotal,
          discountApplied: multiplyRoundDivide(discountApplied),
          discountedTotal: multiplyRoundDivide(discountedTotal),
          discountedUnitPrice,
          taxAmount: multiplyRoundDivide(taxAmount),
          netAmount: multiplyRoundDivide(netAmount),
          cgst: multiplyRoundDivide(cgst),
          sgst: multiplyRoundDivide(sgst),
          igst: multiplyRoundDivide(igst),
          taxTypeId,
        });
      }

      console.log(
        `[FinancesService.calculateOrderTaxes] Tax breakdown complete: CGST=${totalCgst.toFixed(2)}, SGST=${totalSgst.toFixed(2)}, IGST=${totalIgst.toFixed(2)}, total=${totalTax.toFixed(2)}`,
      );
      const result = {
        subTotal: Number(netSubTotal.toFixed(2)),
        totalCgst: Number(totalCgst.toFixed(2)),
        totalSgst: Number(totalSgst.toFixed(2)),
        totalIgst: Number(totalIgst.toFixed(2)),
        totalTax: Number(totalTax.toFixed(2)),
        grandTotal: Number((baseTotal - discountAmount).toFixed(2)),
        discountAmount: Number(discountAmount.toFixed(2)),
        shippingAmount: 0,
        vendorGstId: gstNumberRow?.id ?? null,
        appliedTaxTypeIds: Array.from(appliedTaxTypeIds),
        lineBreakdown,
      };
      console.log(
        '[FinancesService.calculateOrderTaxes] Tax calculation completed successfully',
      );
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        console.error(
          '[FinancesService.calculateOrderTaxes] HTTP Exception:',
          error,
        );
        throw error;
      }
      console.error(
        '[FinancesService.calculateOrderTaxes] Unexpected error:',
        error,
      );
      throw new InternalServerErrorException(
        'Failed to calculate order taxes',
        { cause: error },
      );
    }
  }
}
