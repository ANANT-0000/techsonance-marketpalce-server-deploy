// finances.service.ts
import {
  Injectable,
  InternalServerErrorException,
  Inject,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { eq, desc, sql, and } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import {
  address,
  company_compliance,
  gst_invoices,
  orders,
  product_tax,
  product_variants,
  products,
  tax_profiles,
  tax_rates,
  tax_types,
  vendor,
} from '../../drizzle/schema';
import { CompanyService } from '../company/company.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { COUNTRIES_COMPLIANCE, getStateByCode } from '../../common/constants';

// ─── helpers ────────────────────────────────────────────────────

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

  async getVendorEarnings(domain: string) {
    try {
      const companyId = await this.resolveCompanyId(domain);
      const orderRecords = await this.db.query.orders.findMany({
        where: eq(orders.company_id, companyId),
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
      });

      const PLATFORM_FEE_PERCENTAGE = 0.1;
      const earnings = orderRecords.map((order) => {
        const grossAmount = Number(order.total_amount || 0);
        const platformFee = grossAmount * PLATFORM_FEE_PERCENTAGE;
        const netEarning = grossAmount - platformFee;
        let earningStatus = 'PENDING';
        if (order.payment) {
          const status = order.payment.payment_status?.toUpperCase();
          if (status === 'PAID' || status === 'SUCCESS')
            earningStatus = 'CLEARED';
          else if (status === 'REFUNDED') earningStatus = 'REVERSED';
        }
        return {
          id: order.payment?.id || `calc-${order.id}`,
          order_id: order.id,
          gross_amount: grossAmount.toFixed(2),
          platform_fee: platformFee.toFixed(2),
          net_earning: netEarning.toFixed(2),
          status: earningStatus,
          created_at: order.created_at,
          transaction_ref: order.payment?.transaction_ref || 'N/A',
        };
      });

      const totalCleared = earnings
        .filter((e) => e.status === 'CLEARED')
        .reduce((sum, e) => sum + Number(e.net_earning), 0);
      const totalPending = earnings
        .filter((e) => e.status === 'PENDING')
        .reduce((sum, e) => sum + Number(e.net_earning), 0);

      return {
        total_transactions: earnings.length,
        total_cleared_earnings: totalCleared.toFixed(2),
        total_pending_earnings: totalPending.toFixed(2),
        earnings,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        'Error occurred while fetching company earnings',
        { cause: error },
      );
    }
  }

  async getVendorFinancial(vendorId: string) {
    try {
      const vendorRecord = await this.db.query.vendor.findFirst({
        where: eq(vendor.id, vendorId),
        columns: { company_id: true },
      });
      if (!vendorRecord?.company_id)
        throw new NotFoundException('Vendor or associated company not found');

      const orderRecords = await this.db.query.orders.findMany({
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
      });

      const earnings = orderRecords.map((order) => {
        const grossAmount = Number(order.total_amount || 0);
        let earningStatus = 'PENDING';
        if (order.payment) {
          const status = order.payment.payment_status?.toUpperCase();
          if (status === 'PAID' || status === 'SUCCESS')
            earningStatus = 'CLEARED';
          else if (status === 'REFUNDED' || status === 'FAILED')
            earningStatus = 'REVERSED';
        }
        return {
          id: order.payment?.id || `calc-${order.id}`,
          order_id: order.id,
          gross_amount: grossAmount.toFixed(2),
          platform_fee: '0.00',
          net_earning:
            earningStatus === 'REVERSED' ? '0.00' : grossAmount.toFixed(2),
          status: earningStatus,
          created_at: order.created_at,
          transaction_ref: order.payment?.transaction_ref || 'N/A',
        };
      });

      const totalCleared = earnings
        .filter((e) => e.status === 'CLEARED')
        .reduce((sum, e) => sum + Number(e.net_earning), 0);
      const totalPending = earnings
        .filter((e) => e.status === 'PENDING')
        .reduce((sum, e) => sum + Number(e.net_earning), 0);

      return {
        success: true,
        message: 'Financial ledger retrieved successfully',
        data: {
          total_transactions: earnings.length,
          total_cleared_earnings: totalCleared.toFixed(2),
          total_pending_earnings: totalPending.toFixed(2),
          earnings,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        'Error occurred while fetching vendor financial ledger',
        { cause: error },
      );
    }
  }

  async getGstRegistrations(domain: string) {
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
      .orderBy(desc(company_compliance.created_at));

    const registrations = groupComplianceAsGstRegistrations(rows);
    return { success: true, data: registrations };
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
  async addGstRegistration(domain: string, data: any) {
    const companyId = await this.resolveCompanyId(domain);
    const effectiveTo = data.effective_to
      ? new Date(data.effective_to).toISOString().split('T')[0]
      : '2099-12-31';

    // If this is marked default, unset existing defaults first
    if (data.is_default) {
      await this.db
        .update(company_compliance)
        .set({ field_value: 'false' })
        .where(
          and(
            eq(company_compliance.company_id, companyId),
            eq(company_compliance.country_code, 'IN'),
            eq(company_compliance.field_key, 'gst_is_default'),
          ),
        );
    }

    const complianceRows = [
      {
        company_id: companyId,
        country_code: 'IN',
        field_key: 'gst_number',
        field_value: data.gst_number,
        is_active: true,
        valid_until: effectiveTo,
      },
      {
        company_id: companyId,
        country_code: 'IN',
        field_key: 'gst_state_code',
        field_value: data.state_code,
        is_active: true,
        valid_until: effectiveTo,
      },
      {
        company_id: companyId,
        country_code: 'IN',
        field_key: 'gst_reg_type',
        field_value: data.registration_type,
        is_active: true,
        valid_until: effectiveTo,
      },
      {
        company_id: companyId,
        country_code: 'IN',
        field_key: 'gst_registration_date',
        field_value: new Date(data.registration_date)
          .toISOString()
          .split('T')[0],
        is_active: true,
        valid_until: effectiveTo,
      },
      {
        company_id: companyId,
        country_code: 'IN',
        field_key: 'gst_effective_from',
        field_value: new Date(data.effective_from).toISOString().split('T')[0],
        is_active: true,
        valid_until: effectiveTo,
      },
      {
        company_id: companyId,
        country_code: 'IN',
        field_key: 'gst_is_default',
        field_value: String(data.is_default ?? false),
        is_active: true,
        valid_until: effectiveTo,
      },
    ];

    const inserted = await this.db
      .insert(company_compliance)
      .values(complianceRows)
      .onConflictDoUpdate({
        target: [
          company_compliance.company_id,
          company_compliance.country_code,
          company_compliance.field_key,
        ],
        set: {
          field_value: sql`excluded.field_value`,
          valid_until: sql`excluded.valid_until`,
          updated_at: new Date(),
        },
      })
      .returning();

    return {
      success: true,
      message: 'GST Registration added successfully',
      data: inserted,
    };
  }

  /**
   * GET /finances/gst/:id
   * id here is the company_compliance.id of the gst_number row.
   * We fetch all rows with the same valid_until to reconstruct
   * the full registration view.
   */
  async getSingleGstRegistration(id: string, domain: string) {
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
      .limit(1);

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
      );

    const [registration] = groupComplianceAsGstRegistrations(allRows);
    return { success: true, data: registration ?? null };
  }

  /**
   * PATCH /finances/gst/:id
   * id is the company_compliance.id of the gst_number row.
   * We update all companion rows identified by their field_key
   * and the original valid_until date.
   */
  async updateGstRegistration(id: string, domain: string, data: any) {
    const companyId = await this.resolveCompanyId(domain);

    // Fetch anchor row to get its valid_until (used to identify companion rows)
    const [anchorRow] = await this.db
      .select()
      .from(company_compliance)
      .where(
        and(
          eq(company_compliance.id, id),
          eq(company_compliance.company_id, companyId),
        ),
      )
      .limit(1);

    if (!anchorRow) {
      throw new NotFoundException('GST registration not found');
    }

    const newEffectiveTo = data.effective_to
      ? new Date(data.effective_to).toISOString().split('T')[0]
      : anchorRow.valid_until;

    // If setting as default, clear existing defaults first
    if (data.is_default) {
      await this.db
        .update(company_compliance)
        .set({ field_value: 'false' })
        .where(
          and(
            eq(company_compliance.company_id, companyId),
            eq(company_compliance.country_code, 'IN'),
            eq(company_compliance.field_key, 'gst_is_default'),
          ),
        );
    }

    // Build the updated rows as an upsert batch
    const updatedRows = [
      { field_key: 'gst_number', field_value: data.gst_number },
      { field_key: 'gst_state_code', field_value: data.state_code },
      { field_key: 'gst_reg_type', field_value: data.registration_type },
      {
        field_key: 'gst_registration_date',
        field_value: new Date(data.registration_date)
          .toISOString()
          .split('T')[0],
      },
      {
        field_key: 'gst_effective_from',
        field_value: new Date(data.effective_from).toISOString().split('T')[0],
      },
      {
        field_key: 'gst_is_default',
        field_value: String(data.is_default ?? false),
      },
    ].map((row) => ({
      company_id: companyId,
      country_code: 'IN' as const,
      field_key: row.field_key,
      field_value: row.field_value,
      is_active: true,
      valid_until: newEffectiveTo,
    }));

    const result = await this.db
      .insert(company_compliance)
      .values(updatedRows)
      .onConflictDoUpdate({
        target: [
          company_compliance.company_id,
          company_compliance.country_code,
          company_compliance.field_key,
        ],
        set: {
          field_value: sql`excluded.field_value`,
          valid_until: sql`excluded.valid_until`,
          updated_at: new Date(),
        },
      })
      .returning();

    return {
      success: true,
      message: 'GST updated successfully',
      data: result,
    };
  }

  // ── Tax Profiles ─────────────────────────────────────────────

  async createTaxProfile(domain: string, data: any) {
    const companyId = await this.resolveCompanyId(domain);

    // [FIXED] removed tax_profile_description — column no longer exists
    const newProfile = await this.db
      .insert(tax_profiles)
      .values({
        company_id: companyId,
        profile_type: data.profile_type,
        is_default: data.is_default ?? false,
      })
      .returning();

    return { success: true, message: 'Tax profile created', data: newProfile };
  }

  async getTaxProfiles(domain: string) {
    const companyId = await this.resolveCompanyId(domain);
    const records = await this.db.query.tax_profiles.findMany({
      where: eq(tax_profiles.company_id, companyId),
      orderBy: [desc(tax_profiles.created_at)],
    });
    return { success: true, data: records };
  }

  async updateTaxProfile(id: string, domain: string, data: any) {
    const companyId = await this.resolveCompanyId(domain);
    const updated = await this.db
      .update(tax_profiles)
      .set({ profile_type: data.profile_type, is_default: data.is_default })
      .where(
        and(eq(tax_profiles.id, id), eq(tax_profiles.company_id, companyId)),
      )
      .returning();
    return { success: true, data: updated };
  }

  // ── Tax Rates ────────────────────────────────────────────────

  async createTaxRate(domain: string, data: any) {
    const companyId = await this.resolveCompanyId(domain);

    const newTaxType = await this.db
      .insert(tax_types)
      .values({
        company_id: companyId,
        tax_profile_id: data.tax_profile_id,
        tax_name: data.tax_name,
        tax_code: data.tax_code,
        tax_scope: data.tax_scope,
      })
      .returning();

    const newTaxRate = await this.db
      .insert(tax_rates)
      .values({
        company_id: companyId,
        tax_type_id: newTaxType[0].id,
        tax_rate_name: data.tax_rate_name,
        state: data.state,
        tax_rate_value: data.tax_rate_value,
        is_exempt: data.is_exempt ?? false,
        effective_from: new Date(data.effective_from)
          .toISOString()
          .split('T')[0],
        effective_to: data.effective_to
          ? new Date(data.effective_to).toISOString().split('T')[0]
          : '2099-12-31',
      })
      .returning();

    return {
      success: true,
      message: 'Tax rule created successfully',
      data: newTaxRate,
    };
  }

  async getTaxRates(domain: string) {
    const companyId = await this.resolveCompanyId(domain);
    return this.db.query.tax_rates.findMany({
      where: eq(tax_rates.company_id, companyId),
      orderBy: [desc(tax_rates.created_at)],
    });
  }

  async getTaxRateOptions(domain: string) {
    const companyId = await this.resolveCompanyId(domain);
    return this.db.query.tax_rates.findMany({
      where: eq(tax_rates.company_id, companyId),
      columns: { id: true, tax_rate_name: true },
    });
  }

  // ── Product Tax Mapping ──────────────────────────────────────

  async getProductTaxMapping(domain: string) {
    const companyId = await this.resolveCompanyId(domain);

    const mappedData = await this.db
      .select({
        id: products.id,
        product_name: products.name,
        sku: sql<string>`MAX(${product_variants.sku})`,
        tax_rate_name: tax_rates.tax_rate_name,
        tax_value: tax_rates.tax_rate_value,
        is_mapped: product_tax.id,
        updated_at: product_tax.updated_at,
      })
      .from(products)
      .leftJoin(product_variants, eq(products.id, product_variants.product_id))
      .leftJoin(product_tax, eq(products.id, product_tax.product_id))
      .leftJoin(tax_rates, eq(product_tax.tax_rate_id, tax_rates.id))
      .where(eq(products.company_id, companyId))
      .groupBy(
        products.id,
        products.name,
        tax_rates.tax_rate_name,
        tax_rates.tax_rate_value,
        product_tax.id,
        product_tax.updated_at,
      );

    return {
      success: true,
      data: mappedData.map((item) => ({
        ...item,
        sku: item.sku || 'No SKU assigned',
        is_mapped: !!item.is_mapped,
      })),
    };
  }

  async assignTaxToProduct(
    domain: string,
    data: { product_id: string; tax_rate_id: string },
  ) {
    await this.resolveCompanyId(domain);
    const existingMapping = await this.db.query.product_tax.findFirst({
      where: eq(product_tax.product_id, data.product_id),
    });
    if (existingMapping) {
      const updated = await this.db
        .update(product_tax)
        .set({ tax_rate_id: data.tax_rate_id })
        .where(eq(product_tax.id, existingMapping.id))
        .returning();
      return {
        success: true,
        message: 'Tax rate updated successfully',
        data: updated,
      };
    }
    const inserted = await this.db
      .insert(product_tax)
      .values({ product_id: data.product_id, tax_rate_id: data.tax_rate_id })
      .returning();
    return {
      success: true,
      message: 'Tax rate assigned successfully',
      data: inserted,
    };
  }

  async bulkAssignProductTax(
    domain: string,
    data: { product_ids: string[]; tax_rate_id: string },
  ) {
    await this.resolveCompanyId(domain);
    if (!data.product_ids.length)
      return { success: false, message: 'No product IDs provided' };

    const results = await this.db
      .insert(product_tax)
      .values(
        data.product_ids.map((id) => ({
          product_id: id,
          tax_rate_id: data.tax_rate_id,
        })),
      )
      .onConflictDoUpdate({
        target: product_tax.product_id,
        set: { tax_rate_id: data.tax_rate_id },
      })
      .returning();

    return {
      success: true,
      message: `Successfully processed ${results.length} products`,
      data: results,
    };
  }

  // ── GST Invoices ─────────────────────────────────────────────

  async getGstInvoices(domain: string) {
    const companyId = await this.resolveCompanyId(domain);
    const records = await this.db.query.gst_invoices.findMany({
      where: eq(gst_invoices.company_id, companyId),
      orderBy: [desc(gst_invoices.invoice_date)],
    });
    return { success: true, data: records };
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
    transaction?: DrizzleService,
    company_id?: string,
    domain?: string,
  ) {
    const companyId = domain ? await this.resolveCompanyId(domain) : company_id;
    const tx = transaction ?? this.db;

    if (!companyId) {
      throw new HttpException(
        'Company ID is required for tax calculation',
        HttpStatus.BAD_REQUEST,
      );
    }

    // 1. Customer state
    const [customerAddr] = await tx
      .select({ state: address.state })
      .from(address)
      .where(eq(address.id, customerAddressId))
      .limit(1);

    if (!customerAddr?.state) {
      throw new HttpException(
        'Invalid customer address or missing state',
        HttpStatus.BAD_REQUEST,
      );
    }
    const customerState = customerAddr.state.trim().toLowerCase();

    // Fetch the state_code row that shares the same valid_until

    // Also fetch the gst_number for returning vendorGstId
    const [countryCompliance] = await tx
      .select()
      .from(company_compliance)
      .where(eq(company_compliance.company_id, companyId))
      .catch((error) => {
        console.error('Error fetching company compliance:', error);
        throw new HttpException(
          'Error fetching company compliance: ' + error,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      });

    const fields = COUNTRIES_COMPLIANCE.find(
      (c) => c.country_code === countryCompliance.country_code,
    )?.fields;
    if (!fields) {
      throw new HttpException(
        'Country compliance config not found.',
        HttpStatus.BAD_REQUEST,
      );
    }
    console.log('Compliance fields:', fields);
    /**
     * Find tax field (GSTIN for India)
     */
    const gstField = fields.find(
      (f) => f.is_primary_tax_id || f.value === 'gstin',
    );

    if (!gstField?.value) {
      throw new HttpException(
        'GST field config missing.',
        HttpStatus.BAD_REQUEST,
      );
    }
    console.log('Found GST field:', gstField);
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
        console.error('Error fetching vendor GST number:', error);
        throw new HttpException(
          'Error fetching vendor GST number: ' + error,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      });

    if (!gstNumberRow?.field_value) {
      throw new HttpException(
        'Vendor GST number is missing.',
        HttpStatus.BAD_REQUEST,
      );
    }

    /**
     * State code = first 2 digits of GSTIN
     * Example: 24ABCDE1234F1Z5 => 24
     */
    const stateCode = gstNumberRow.field_value.slice(0, 2);

    if (!stateCode) {
      throw new HttpException(
        'Vendor GST state code is missing.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const vendorState = getStateByCode(stateCode)?.state.trim().toLowerCase();
    const isIntraState = customerState === vendorState;

    // 3. Calculate taxes (logic unchanged from original)
    let subTotal = 0;
    let netSubTotal = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    let totalTax = 0;
    const appliedTaxTypeIds = new Set<string>();

    for (const item of cartItems) {
      const baseItemTotal = Number(item.price) * item.quantity;
      subTotal += baseItemTotal;

      const [variantRecord] = await tx
        .select({ product_id: product_variants.product_id })
        .from(product_variants)
        .where(eq(product_variants.id, item.variantId));

      if (!variantRecord?.product_id) {
        throw new HttpException(
          `Product variant not found for ID: ${item.variantId}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      const productTaxMapping = await tx
        .select({
          rate: tax_rates.tax_rate_value,
          taxTypeId: tax_rates.tax_type_id,
        })
        .from(product_tax)
        .leftJoin(tax_rates, eq(product_tax.tax_rate_id, tax_rates.id))
        .where(eq(product_tax.product_id, variantRecord.product_id))
        .limit(1)
        .catch((error) => {
          throw new HttpException(
            'Error fetching tax mapping for product: ' + error.message,
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        });

      const mapping = productTaxMapping[0];
      const taxPercentage = mapping ? Number(mapping.rate) : 0;
      if (mapping?.taxTypeId) appliedTaxTypeIds.add(mapping.taxTypeId);

      const itemTaxAmount =
        baseItemTotal - baseItemTotal / (1 + taxPercentage / 100);
      const itemNetAmount = baseItemTotal - itemTaxAmount;
      netSubTotal += itemNetAmount;

      if (isIntraState) {
        totalCgst += itemTaxAmount / 2;
        totalSgst += itemTaxAmount / 2;
      } else {
        totalIgst += itemTaxAmount;
      }
      totalTax += itemTaxAmount;
    }

    return {
      subTotal: Number(netSubTotal.toFixed(2)),
      totalCgst: Number(totalCgst.toFixed(2)),
      totalSgst: Number(totalSgst.toFixed(2)),
      totalIgst: Number(totalIgst.toFixed(2)),
      totalTax: Number(totalTax.toFixed(2)),
      grandTotal: Number(subTotal.toFixed(2)),
      // [CHANGED] vendorGstId now returns the compliance row id
      // of the gst_number row (same role as old gst_registrations.id)
      vendorGstId: gstNumberRow?.id ?? null,
      appliedTaxTypeIds: Array.from(appliedTaxTypeIds),
    };
  }
}
