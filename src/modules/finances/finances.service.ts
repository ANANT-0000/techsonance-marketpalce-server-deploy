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
import { FinancesErrorKeyEnum } from './constants/finances.enums';

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
      const companyId = await this.resolveCompanyId(domain);

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
      const [totalOrders] = await this.db
        .select({
          total: count(orders.id),
        })
        .from(orders)
        .where(eq(orders.company_id, companyId))
        .catch((err) => {
          throw new InternalServerErrorException(
            FinancesErrorKeyEnum.FAILED_TO_FETCH_TOTAL_ORDERS_COUNT,
            { cause: err },
          );
        });
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
          throw new InternalServerErrorException(
            FinancesErrorKeyEnum.FAILED_TO_FETCH_ORDERS_FOR_EARNINGS,
            {
              cause: error,
            },
          );
        });

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

      const result = {
        total_transactions: totalOrders.total,
        total_cleared_earnings: totalCleared.toFixed(2),
        total_pending_earnings: totalPending.toFixed(2),
        earnings,
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        FinancesErrorKeyEnum.ERROR_OCCURRED_WHILE_FETCHING_COMPANY_EARNINGS,
        { cause: error },
      );
    }
  }

  async getVendorFinancial(vendorId: string) {
    try {
      const vendorRecord = await this.db.query.vendor
        .findFirst({
          where: eq(vendor.id, vendorId),
          columns: { company_id: true },
        })
        .catch((err) => {
          throw new InternalServerErrorException(
            FinancesErrorKeyEnum.FAILED_TO_FETCH_VENDOR_RECORD,
            { cause: err },
          );
        });
      if (!vendorRecord?.company_id) {
        throw new NotFoundException(FinancesErrorKeyEnum.VENDOR_OR_ASSOCIATED_COMPANY_NOT_FOUND);
      }

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
          throw new InternalServerErrorException(
            FinancesErrorKeyEnum.FAILED_TO_FETCH_VENDOR_ORDER_RECORDS,
            { cause: err },
          );
        });

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
      return result;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        FinancesErrorKeyEnum.ERROR_OCCURRED_WHILE_FETCHING_VENDOR_FINANCIAL_LEDGER,
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
      const companyId = await this.resolveCompanyId(domain);

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
          throw new InternalServerErrorException(
            FinancesErrorKeyEnum.FAILED_TO_FETCH_GST_REGISTRATIONS,
            { cause: err },
          );
        });

      const registrations = groupComplianceAsGstRegistrations(rows);
      return { success: true, data: registrations };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        FinancesErrorKeyEnum.FAILED_TO_FETCH_GST_REGISTRATIONS,
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
      const companyId = await this.resolveCompanyId(domain);

      // Fetch the anchor row (gst_number row) by its id
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
          throw new InternalServerErrorException(
            FinancesErrorKeyEnum.FAILED_TO_FETCH_GST_REGISTRATION,
            { cause: err },
          );
        });

      if (!anchorRow) {
        return { success: false, data: null };
      }

      // Fetch all companion rows for this registration (same valid_until)
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
          throw new InternalServerErrorException(
            FinancesErrorKeyEnum.FAILED_TO_FETCH_GST_REGISTRATION_DETAILS,
            { cause: err },
          );
        });

      const [registration] = groupComplianceAsGstRegistrations(allRows);
      return { success: true, data: registration ?? null };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        FinancesErrorKeyEnum.FAILED_TO_FETCH_SINGLE_GST_REGISTRATION,
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
      const companyId = await this.resolveCompanyId(domain);


      const [newProfile] = await this.db
        .insert(tax_profiles)
        .values({
          company_id: companyId,
          profile_type: data.profile_type,
          is_default: data.is_default ?? false,
        })
        .returning()
        .catch((err) => {
          throw new InternalServerErrorException(
            FinancesErrorKeyEnum.FAILED_TO_CREATE_TAX_PROFILE,
            { cause: err },
          );
        });

      return newProfile;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(FinancesErrorKeyEnum.FAILED_TO_CREATE_TAX_PROFILE, {
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
      const companyId = await this.resolveCompanyId(domain);

      const { limit, offset, date, status, search, sortby } = filters;
      const records = await this.db.query.tax_profiles
        .findMany({
          limit: limit,
          offset: offset,
          where: eq(tax_profiles.company_id, companyId),
          orderBy: [desc(tax_profiles.created_at)],
        })
        .catch((err) => {
          throw new InternalServerErrorException(
            FinancesErrorKeyEnum.FAILED_TO_FETCH_TAX_PROFILES,
            { cause: err },
          );
        });

      return records;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(FinancesErrorKeyEnum.FAILED_TO_FETCH_TAX_PROFILES, {
        cause: error,
      });
    }
  }

  async updateTaxProfile(id: string, domain: string, data: any) {
    try {
      const companyId = await this.resolveCompanyId(domain);

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
          throw new InternalServerErrorException(
            FinancesErrorKeyEnum.FAILED_TO_UPDATE_TAX_PROFILE,
            { cause: err },
          );
        });

      if (!updated) {
        throw new NotFoundException(FinancesErrorKeyEnum.TAX_PROFILE_NOT_FOUND);
      }

      return updated;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(FinancesErrorKeyEnum.FAILED_TO_UPDATE_TAX_PROFILE, {
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
    if (!record) throw new NotFoundException(FinancesErrorKeyEnum.TAX_PROFILE_NOT_FOUND);
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
        throw new InternalServerErrorException(FinancesErrorKeyEnum.FAILED_TO_CREATE_TAX_TYPE, {
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
        throw new InternalServerErrorException(FinancesErrorKeyEnum.FAILED_TO_CREATE_TAX_SLAB, {
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

    if (!record) throw new NotFoundException(FinancesErrorKeyEnum.TAX_SLAB_NOT_FOUND);
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

    if (!existing) throw new NotFoundException(FinancesErrorKeyEnum.TAX_SLAB_NOT_FOUND);

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
          throw new InternalServerErrorException(FinancesErrorKeyEnum.FAILED_TO_UPDATE_TAX_TYPE, {
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
        throw new InternalServerErrorException(FinancesErrorKeyEnum.FAILED_TO_UPDATE_TAX_SLAB, {
          cause: err,
        });
      });

    return updated;
  }

  async getTaxRateOptions(domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);

      const options = await this.db.query.tax_slabs
        .findMany({
          where: eq(tax_slabs.company_id, companyId),
          columns: { id: true, slab_name: true },
        })
        .catch((err) => {
          throw new InternalServerErrorException(
            FinancesErrorKeyEnum.FAILED_TO_FETCH_TAX_RATE_OPTIONS,
            { cause: err },
          );
        });

      return options;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        FinancesErrorKeyEnum.FAILED_TO_FETCH_TAX_RATE_OPTIONS,
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
      const companyId = await this.resolveCompanyId(domain);

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
          throw new InternalServerErrorException(
            FinancesErrorKeyEnum.FAILED_TO_GET_PRODUCT_TAX_MAPPING,
            {
              cause: error,
            },
          );
        });
      return mappedData.map((item) => ({
        ...item,
        sku: item.sku || 'No SKU assigned',
        is_mapped: !!item.is_mapped,
      }));
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        FinancesErrorKeyEnum.FAILED_TO_GET_PRODUCT_TAX_MAPPING,
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
      await this.resolveCompanyId(domain);

      const existingMapping = await this.db.query.product_tax
        .findFirst({
          where: eq(product_tax.product_id, data.product_id),
        })
        .catch((err) => {
          throw new InternalServerErrorException(
            FinancesErrorKeyEnum.FAILED_TO_CHECK_PRODUCT_TAX_MAPPING,
            { cause: err },
          );
        });

      if (existingMapping) {
        const updated = await this.db
          .update(product_tax)
          .set({ tax_slab_id: data.tax_slab_id })
          .where(eq(product_tax.id, existingMapping.id))
          .returning()
          .catch((err) => {
            throw new InternalServerErrorException(
              FinancesErrorKeyEnum.FAILED_TO_UPDATE_PRODUCT_TAX_MAPPING,
              { cause: err },
            );
          });
        return updated;
      }

      const inserted = await this.db
        .insert(product_tax)
        .values({
          product_id: data.product_id,
          tax_slab_id: data.tax_slab_id,
        })
        .returning()
        .catch((err) => {
          throw new InternalServerErrorException(
            FinancesErrorKeyEnum.FAILED_TO_ASSIGN_TAX_TO_PRODUCT,
            { cause: err },
          );
        });

      return inserted;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        FinancesErrorKeyEnum.FAILED_TO_ASSIGN_TAX_TO_PRODUCT,
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
      await this.resolveCompanyId(domain);

      if (!data.product_ids.length) {
        return { success: false, message: 'No product IDs provided' };
      }

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
          throw new InternalServerErrorException(
            FinancesErrorKeyEnum.FAILED_TO_BULK_ASSIGN_PRODUCT_TAX,
            { cause: err },
          );
        });

      return results;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        FinancesErrorKeyEnum.FAILED_TO_BULK_ASSIGN_PRODUCT_TAX,
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
      const companyId = await this.resolveCompanyId(domain);

      const conditions = [eq(gst_invoices.company_id, companyId)];

      if (search?.trim()) {
        conditions.push(
          ilike(gst_invoices.invoice_number, `%${search.trim()}%`),
        );
      }

      if (date) {
        const parsedDate = new Date(date);
        if (!Number.isNaN(parsedDate.getTime())) {
          // conditions.push(
          //   eq(gst_invoices.invoice_date, parsedDate.toISOString().slice(0, 10)),
          // );
        }
      }

      const [totalInvoices] = await this.db
        .select({ count: count(gst_invoices.id) })
        .from(gst_invoices)
        .where(eq(gst_invoices.company_id, companyId));
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
            FinancesErrorKeyEnum.ERROR_FETCHING_GST_INVOICES + error,
          );
        });
      return {
        invoices: records,
        total: totalInvoices.count,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(FinancesErrorKeyEnum.FAILED_TO_FETCH_GST_INVOICES, {
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
      const companyId = domain
        ? await this.resolveCompanyId(domain)
        : company_id;
      const tx = transaction ?? this.db;

      if (!companyId) {
        throw new HttpException(
          FinancesErrorKeyEnum.COMPANY_ID_IS_REQUIRED_FOR_TAX_CALCULATION,
          HttpStatus.BAD_REQUEST,
        );
      }

      // 1. Customer state
      const [customerAddr] = await tx
        .select({ state: address.state })
        .from(address)
        .where(eq(address.id, customerAddressId))
        .limit(1)
        .catch((err) => {
          throw new HttpException(
            FinancesErrorKeyEnum.ERROR_FETCHING_CUSTOMER_ADDRESS,
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        });

      if (!customerAddr?.state) {
        throw new HttpException(
          FinancesErrorKeyEnum.INVALID_CUSTOMER_ADDRESS_OR_MISSING_STATE,
          HttpStatus.BAD_REQUEST,
        );
      }
      const customerState = customerAddr.state.trim().toLowerCase();

      const [countryCompliance] = await tx
        .select()
        .from(company_compliance)
        .where(eq(company_compliance.company_id, companyId))
        .catch((error) => {
          throw new HttpException(
            FinancesErrorKeyEnum.ERROR_FETCHING_COMPANY_COMPLIANCE,
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        });

      const fields = COUNTRIES_COMPLIANCE.find(
        (c) => c.country_code === countryCompliance.country_code,
      )?.fields;
      if (!fields) {
        throw new HttpException(
          FinancesErrorKeyEnum.COUNTRY_COMPLIANCE_CONFIG_NOT_FOUND,
          HttpStatus.BAD_REQUEST,
        );
      }

      const gstField = fields.find(
        (f) => f.is_primary_tax_id || f.value === 'gstin',
      );
      if (!gstField?.value) {
        throw new HttpException(
          FinancesErrorKeyEnum.GST_FIELD_CONFIG_MISSING,
          HttpStatus.BAD_REQUEST,
        );
      }

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
          throw new HttpException(
            FinancesErrorKeyEnum.ERROR_FETCHING_VENDOR_GST_NUMBER,
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        });

      if (!gstNumberRow?.field_value) {
        throw new HttpException(
          FinancesErrorKeyEnum.VENDOR_GST_NUMBER_IS_MISSING,
          HttpStatus.BAD_REQUEST,
        );
      }

      const stateCode = gstNumberRow.field_value.slice(0, 2);
      if (!stateCode) {
        throw new HttpException(
          FinancesErrorKeyEnum.VENDOR_GST_STATE_CODE_IS_MISSING,
          HttpStatus.BAD_REQUEST,
        );
      }
      const vendorState = getStateByCode(stateCode)?.state.trim().toLowerCase();
      const isIntraState = customerState === vendorState;
      // 2. Pre-compute base total once (used for proportional discount splitting)
      const baseTotal = cartItems.reduce(
        (sum, item) => sum + Number(item.price) * item.quantity,
        0,
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

      for (const item of cartItems) {
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
        const [variantRecord] = await tx
          .select({ product_id: product_variants.product_id })
          .from(product_variants)
          .where(eq(product_variants.id, item.variantId))
          .catch((err) => {
            throw new HttpException(
              `Error fetching product variant: ${item.variantId}`,
              HttpStatus.INTERNAL_SERVER_ERROR,
            );
          });

        if (!variantRecord?.product_id) {
          throw new HttpException(
            `Product variant not found for ID: ${item.variantId}`,
            HttpStatus.BAD_REQUEST,
          );
        }

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
            throw new HttpException(
              FinancesErrorKeyEnum.ERROR_FETCHING_TAX_MAPPING_FOR_PRODUCT,
              HttpStatus.INTERNAL_SERVER_ERROR,
            );
          });

        const taxPercentage = productTaxMapping
          ? Number(productTaxMapping.totalRate)
          : 0;
        const taxTypeId = productTaxMapping?.taxTypeId ?? null;
        if (taxTypeId) appliedTaxTypeIds.add(taxTypeId);

        // Tax extraction from tax-inclusive discounted total
        // Formula: taxAmount = discountedTotal - discountedTotal / (1 + rate/100)
        const taxAmount =
          discountedTotal - discountedTotal / (1 + taxPercentage / 100);
        const netAmount = discountedTotal - taxAmount;

        const cgst = isIntraState ? taxAmount / 2 : 0;
        const sgst = isIntraState ? taxAmount / 2 : 0;
        const igst = !isIntraState ? taxAmount : 0;


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
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        FinancesErrorKeyEnum.FAILED_TO_CALCULATE_ORDER_TAXES,
        { cause: error },
      );
    }
  }
}
