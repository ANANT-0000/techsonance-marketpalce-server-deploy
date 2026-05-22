import { company } from './../../drizzle/schema/main.schema';
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
  gst_invoices,
  gst_registrations,
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
import { getStateByCode } from '../../common/state_code';

@Injectable()
export class FinancesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
  ) {}

  private async resolveCompanyId(domain: string): Promise<string> {
    console.log(
      `[FinancesService.resolveCompanyId] Resolving company for domain: ${domain}`,
    );
    const filteredDomain = domainExtractor(domain);
    console.log(
      `[FinancesService.resolveCompanyId] Extracted filter domain: ${filteredDomain}`,
    );
    console.log(
      '[FinancesService.resolveCompanyId] Querying CompanyService.find(...)',
    );
    return this.companyService.find(filteredDomain);
  }

  async getVendorEarnings(domain: string) {
    console.log(
      '[FinancesService.getVendorEarnings] Request received for domain:',
      domain,
    );
    try {
      console.log('[FinancesService.getVendorEarnings] Resolving company id');
      const companyId = await this.resolveCompanyId(domain);
      console.log(
        `[FinancesService.getVendorEarnings] Querying orders for company_id: ${companyId}`,
      );

      // Using Drizzle's Relational Query API
      // This automatically checks your schema relations and connects the IDs
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

      // Calculate earnings on the fly
      // Note: You can move this to an env variable or config table later
      const PLATFORM_FEE_PERCENTAGE = 0.1; // 10% commission

      const earnings = orderRecords.map((order) => {
        const grossAmount = Number(order.total_amount || 0);
        const platformFee = grossAmount * PLATFORM_FEE_PERCENTAGE;
        const netEarning = grossAmount - platformFee;

        // Determine Settlement Status based on the connected Payment record
        let earningStatus = 'PENDING';

        if (order.payment) {
          const status = order.payment.payment_status?.toUpperCase();
          if (status === 'PAID' || status === 'SUCCESS') {
            earningStatus = 'CLEARED';
          } else if (status === 'REFUNDED') {
            earningStatus = 'REVERSED';
          }
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

      // Calculate aggregate dashboard stats
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
        earnings: earnings,
      };
    } catch (error) {
      console.error(
        '[FinancesService.getVendorEarnings] FinancesService Error: ',
        error,
      );
      throw new InternalServerErrorException(
        'Error occurred while fetching company earnings via relations',
        { cause: error },
      );
    }
  }
  async getVendorFinancial(vendorId: string) {
    console.log(
      '[FinancesService.getVendorFinancial] Request received for vendorId:',
      vendorId,
    );
    try {
      console.log(
        '[FinancesService.getVendorFinancial] Querying vendor record',
      );
      // 1. First, find the vendor to get their associated company_id
      const vendorRecord = await this.db.query.vendor.findFirst({
        where: eq(vendor.id, vendorId),
        columns: {
          company_id: true,
        },
      });

      if (!vendorRecord || !vendorRecord.company_id) {
        throw new NotFoundException('Vendor or associated company not found');
      }
      console.log(
        `[FinancesService.getVendorFinancial] Vendor company resolved: ${vendorRecord.company_id}`,
      );

      // 2. Fetch all orders and their associated payments for this company
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

      // 3. Map the records to match the FinancialData interface for the frontend
      const earnings = orderRecords.map((order) => {
        const grossAmount = Number(order.total_amount || 0);

        // Zero-commission model: Vendor keeps 100%
        const netEarning = grossAmount;

        // Determine Settlement Status
        let earningStatus = 'PENDING';

        if (order.payment) {
          const status = order.payment.payment_status?.toUpperCase();
          if (status === 'PAID' || status === 'SUCCESS') {
            earningStatus = 'CLEARED';
          } else if (status === 'REFUNDED' || status === 'FAILED') {
            earningStatus = 'REVERSED';
          }
        }

        return {
          id: order.payment?.id || `calc-${order.id}`,
          order_id: order.id,
          gross_amount: grossAmount.toFixed(2),
          platform_fee: '0.00', // No commission taken per order
          net_earning:
            earningStatus === 'REVERSED' ? '0.00' : netEarning.toFixed(2),
          status: earningStatus,
          created_at: order.created_at,
          transaction_ref: order.payment?.transaction_ref || 'N/A',
        };
      });

      // 4. Calculate Aggregate KPIs
      const totalCleared = earnings
        .filter((e) => e.status === 'CLEARED')
        .reduce((sum, e) => sum + Number(e.net_earning), 0);

      const totalPending = earnings
        .filter((e) => e.status === 'PENDING')
        .reduce((sum, e) => sum + Number(e.net_earning), 0);

      // 5. Return the exact structure the UI expects
      return {
        success: true,
        message: 'Financial ledger retrieved successfully',
        data: {
          total_transactions: earnings.length,
          total_cleared_earnings: totalCleared.toFixed(2),
          total_pending_earnings: totalPending.toFixed(2),
          earnings: earnings,
        },
      };
    } catch (error) {
      console.error(
        '[FinancesService.getVendorFinancial] AdminFinancesService Error: ',
        error,
      );

      if (error instanceof NotFoundException) throw error;

      throw new InternalServerErrorException(
        'Error occurred while fetching vendor financial ledger',
        { cause: error },
      );
    }
  }
  // 1. GST Registrations
  async getGstRegistrations(domain: string) {
    console.log(
      '[FinancesService.getGstRegistrations] Request received for domain:',
      domain,
    );
    console.log('[FinancesService.getGstRegistrations] Resolving company id');
    const companyId = await this.resolveCompanyId(domain);
    console.log(
      `[FinancesService.getGstRegistrations] Querying GST registrations for company_id: ${companyId}`,
    );

    const records = await this.db.query.gst_registrations.findMany({
      where: eq(gst_registrations.company_id, companyId),
      orderBy: [desc(gst_registrations.created_at)],
    });
    return { success: true, data: records };
  }

  async addGstRegistration(domain: string, data: any) {
    console.log(
      '[FinancesService.addGstRegistration] Request received for domain:',
      domain,
    );
    console.log('[FinancesService.addGstRegistration] Resolving company id');
    const companyId = await this.resolveCompanyId(domain);
    console.log(
      '[FinancesService.addGstRegistration] Adding GST Registration for Company ID:',
      companyId,
      'with data:',
      data,
    );
    const newRecord = await this.db
      .insert(gst_registrations)
      .values({
        company_id: companyId,
        gst_number: data.gst_number,
        legal_name: data.legal_name,
        trade_name: data.trade_name,
        state_code: data.state_code,
        registration_type: data.registration_type,
        registration_date: new Date(data.registration_date)
          .toISOString()
          .split('T')[0],
        effective_from: new Date(data.effective_from)
          .toISOString()
          .split('T')[0],
        effective_to: data.effective_to
          ? new Date(data.effective_to).toISOString().split('T')[0]
          : '2099-12-31',
        is_default: data.is_default || false,
      })
      .returning();
    console.log(
      '[FinancesService.addGstRegistration] GST registration created successfully',
    );

    return {
      success: true,
      message: 'GST Registration added successfully',
      data: newRecord,
    };
  }
  async createTaxProfile(domain: string, data: any) {
    console.log(
      '[FinancesService.createTaxProfile] Request received for domain:',
      domain,
    );
    console.log('[FinancesService.createTaxProfile] Resolving company id');
    const companyId = await this.resolveCompanyId(domain);
    console.log(
      `[FinancesService.createTaxProfile] Creating tax profile for company_id: ${companyId}`,
    );

    const newProfile = await this.db
      .insert(tax_profiles)
      .values({
        company_id: companyId,
        profile_type: data.profile_type,
        tax_profile_description: data.tax_profile_description,
        is_default: data.is_default || false,
      })
      .returning();

    console.log(
      '[FinancesService.createTaxProfile] Tax profile created successfully',
    );

    return { success: true, message: 'Tax profile created', data: newProfile };
  }

  // 2. Create Tax Rate (Combines Tax Type + Tax Rate insertion)
  async createTaxRate(domain: string, data: any) {
    console.log('[FinancesService.createTaxRate] Request received', { domain });
    console.log('[FinancesService.createTaxRate] Resolving company id');
    const companyId = await this.resolveCompanyId(domain);
    console.log(
      `[FinancesService.createTaxRate] Creating tax type and rate for company_id: ${companyId}`,
    );

    // Step A: Insert into tax_types
    console.log('[FinancesService.createTaxRate] Inserting tax type');
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

    // Step B: Insert into tax_rates using the new tax_type.id
    console.log('[FinancesService.createTaxRate] Inserting tax rate');
    const newTaxRate = await this.db
      .insert(tax_rates)
      .values({
        company_id: companyId,
        tax_type_id: newTaxType[0].id,
        tax_rate_name: data.tax_rate_name,
        state: data.state,
        tax_rate_value: data.tax_rate_value,
        is_exempt: data.is_exempt || false,
        effective_from: new Date(data.effective_from)
          .toISOString()
          .split('T')[0],
        effective_to: data.effective_to
          ? new Date(data.effective_to).toISOString().split('T')[0]
          : '2099-12-31',
      })
      .returning();

    console.log(
      '[FinancesService.createTaxRate] Tax rate created successfully',
    );

    return {
      success: true,
      message: 'Tax rule created successfully',
      data: newTaxRate,
    };
  }
  // 2. Tax Profiles
  async getTaxProfiles(domain: string) {
    console.log('[FinancesService.getTaxProfiles] Request received', {
      domain,
    });
    console.log('[FinancesService.getTaxProfiles] Resolving company id');
    const companyId = await this.resolveCompanyId(domain);
    console.log(
      `[FinancesService.getTaxProfiles] Querying tax profiles for company_id: ${companyId}`,
    );

    const records = await this.db.query.tax_profiles.findMany({
      where: eq(tax_profiles.company_id, companyId),
      orderBy: [desc(tax_profiles.created_at)],
    });
    return { success: true, data: records };
  }

  // 3. Tax Rates
  async getTaxRates(domain: string) {
    console.log('[FinancesService.getTaxRates] Request received', { domain });
    console.log('[FinancesService.getTaxRates] Resolving company id');
    const companyId = await this.resolveCompanyId(domain);
    console.log(
      `[FinancesService.getTaxRates] Querying tax rates for company_id: ${companyId}`,
    );

    const records = await this.db.query.tax_rates.findMany({
      where: eq(tax_rates.company_id, companyId),
      orderBy: [desc(tax_rates.created_at)],
    });
    return records;
  }
  async getTaxRateOptions(domain: string) {
    console.log('[FinancesService.getTaxRateOptions] Request received', {
      domain,
    });
    console.log('[FinancesService.getTaxRateOptions] Resolving company id');
    const companyId = await this.resolveCompanyId(domain);
    console.log(
      `[FinancesService.getTaxRateOptions] Querying tax rate options for company_id: ${companyId}`,
    );

    const records = await this.db.query.tax_rates.findMany({
      where: eq(tax_rates.company_id, companyId),
      orderBy: [desc(tax_rates.created_at)],
      columns: { id: true, tax_rate_name: true },
    });
    return records;
  }

  // 4. Product Tax Mapping (The Bridge)
  async getProductTaxMapping(domain: string) {
    console.log(
      '[FinancesService.getProductTaxMapping] Request received for domain:',
      domain,
    );
    console.log('[FinancesService.getProductTaxMapping] Resolving company id');
    const companyId = await this.resolveCompanyId(domain);
    console.log(
      `[FinancesService.getProductTaxMapping] Querying mapped products for company_id: ${companyId}`,
    );

    // Because a product can have multiple variants (and thus multiple SKUs),
    // we use an aggregation to grab either the first SKU or an array of SKUs.
    // For simplicity in the UI, we'll grab just the first SKU using a subquery or GROUP BY.

    const mappedData = await this.db
      .select({
        id: products.id,
        product_name: products.name,
        // Grab the first variant's SKU to represent the product in the table
        sku: sql<string>`MAX(${product_variants.sku})`,
        tax_rate_name: tax_rates.tax_rate_name,
        tax_value: tax_rates.tax_rate_value,
        is_mapped: product_tax.id, // If this exists, it is mapped
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

    // Format for the frontend
    const formattedData = mappedData.map((item) => ({
      ...item,
      // If the product has no variants yet, SKU might be null
      sku: item.sku || 'No SKU assigned',
      is_mapped: !!item.is_mapped,
    }));

    console.log(
      `[FinancesService.getProductTaxMapping] Retrieved ${formattedData.length} mapped product record(s)`,
    );

    return { success: true, data: formattedData };
  }

  // 5. GST Invoices
  async getGstInvoices(domain: string) {
    console.log(
      '[FinancesService.getGstInvoices] Request received for domain:',
      domain,
    );
    console.log('[FinancesService.getGstInvoices] Resolving company id');
    const companyId = await this.resolveCompanyId(domain);
    console.log(
      `[FinancesService.getGstInvoices] Querying GST invoices for company_id: ${companyId}`,
    );

    const records = await this.db.query.gst_invoices.findMany({
      where: eq(gst_invoices.company_id, companyId),
      orderBy: [desc(gst_invoices.invoice_date)],
    });
    return { success: true, data: records };
  }
  async getSingleGstRegistration(id: string, domain: string) {
    console.log('[FinancesService.getSingleGstRegistration] Request received', {
      id,
      domain,
    });
    console.log(
      '[FinancesService.getSingleGstRegistration] Resolving company id',
    );
    const companyId = await this.resolveCompanyId(domain);
    console.log(
      `[FinancesService.getSingleGstRegistration] Querying GST registration: ${id}`,
    );

    const record = await this.db.query.gst_registrations.findFirst({
      where: and(
        eq(gst_registrations.id, id),
        eq(gst_registrations.company_id, companyId),
      ),
    });
    return { success: true, data: record };
  }

  // Handle the PATCH update
  async updateGstRegistration(id: string, domain: string, data: any) {
    console.log('[FinancesService.updateGstRegistration] Request received', {
      id,
      domain,
    });
    console.log('[FinancesService.updateGstRegistration] Resolving company id');
    const companyId = await this.resolveCompanyId(domain);
    console.log(
      `[FinancesService.updateGstRegistration] Updating GST registration: ${id}`,
    );

    const updatedRecord = await this.db
      .update(gst_registrations)
      .set({
        gst_number: data.gst_number,
        legal_name: data.legal_name,
        trade_name: data.trade_name,
        state_code: data.state_code,
        registration_type: data.registration_type,
        registration_date: new Date(data.registration_date)
          .toISOString()
          .split('T')[0],
        effective_from: new Date(data.effective_from)
          .toISOString()
          .split('T')[0],
        is_default: data.is_default,
        // Drizzle schema already has .$onUpdate(() => new Date()) for updated_at
      })
      .where(
        and(
          eq(gst_registrations.id, id),
          eq(gst_registrations.company_id, companyId),
        ),
      )
      .returning();

    console.log(
      '[FinancesService.updateGstRegistration] GST registration updated successfully',
    );

    return {
      success: true,
      message: 'GST updated successfully',
      data: updatedRecord,
    };
  }

  // --- REPEAT PATTERN FOR PROFILES & RATES ---
  async updateTaxProfile(id: string, domain: string, data: any) {
    console.log('[FinancesService.updateTaxProfile] Request received', {
      id,
      domain,
    });
    console.log('[FinancesService.updateTaxProfile] Resolving company id');
    const companyId = await this.resolveCompanyId(domain);
    console.log(
      `[FinancesService.updateTaxProfile] Updating tax profile: ${id}`,
    );

    const updated = await this.db
      .update(tax_profiles)
      .set({
        profile_type: data.profile_type,
        tax_profile_description: data.tax_profile_description,
        is_default: data.is_default,
      })
      .where(
        and(eq(tax_profiles.id, id), eq(tax_profiles.company_id, companyId)),
      )
      .returning();

    console.log(
      '[FinancesService.updateTaxProfile] Tax profile updated successfully',
    );

    return { success: true, data: updated };
  }
  // 6. Assign Tax to Product (Upsert Logic)
  async assignTaxToProduct(
    domain: string,
    data: { product_id: string; tax_rate_id: string },
  ) {
    console.log(
      '[FinancesService.assignTaxToProduct] Request received for domain:',
      domain,
    );
    console.log('[FinancesService.assignTaxToProduct] Resolving company id');
    const companyId = await this.resolveCompanyId(domain); // Used for security validation if needed
    console.log(
      `[FinancesService.assignTaxToProduct] Company ID resolved: ${companyId}`,
    );

    // Check if the product already has a tax mapped
    console.log(
      '[FinancesService.assignTaxToProduct] Checking existing tax mapping',
    );
    const existingMapping = await this.db.query.product_tax.findFirst({
      where: eq(product_tax.product_id, data.product_id),
    });

    if (existingMapping) {
      // UPDATE existing mapping
      console.log(
        '[FinancesService.assignTaxToProduct] Updating existing tax mapping',
      );
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
    } else {
      // INSERT new mapping
      console.log(
        '[FinancesService.assignTaxToProduct] Creating new tax mapping',
      );
      const inserted = await this.db
        .insert(product_tax)
        .values({
          product_id: data.product_id,
          tax_rate_id: data.tax_rate_id,
        })
        .returning();
      return {
        success: true,
        message: 'Tax rate assigned successfully',
        data: inserted,
      };
    }
  }
  async bulkAssignProductTax(
    domain: string,
    data: { product_ids: string[]; tax_rate_id: string },
  ) {
    console.log('[FinancesService.bulkAssignProductTax] Request received', {
      domain,
      count: data.product_ids.length,
    });
    console.log('[FinancesService.bulkAssignProductTax] Resolving company id');
    const companyId = await this.resolveCompanyId(domain);
    console.log(
      `[FinancesService.bulkAssignProductTax] Company ID resolved: ${companyId}`,
    );

    // Prepare the batch data
    const valuesToUpsert = data.product_ids.map((id) => ({
      product_id: id,
      tax_rate_id: data.tax_rate_id,
    }));

    if (valuesToUpsert.length === 0) {
      return { success: false, message: 'No product IDs provided' };
    }

    // Use Upsert: Insert new ones, or update tax_rate_id if product_id already exists
    console.log(
      '[FinancesService.bulkAssignProductTax] Performing bulk upsert',
    );
    const results = await this.db
      .insert(product_tax)
      .values(valuesToUpsert)
      .onConflictDoUpdate({
        target: product_tax.product_id, // Ensure you have a UNIQUE constraint on product_id
        set: { tax_rate_id: data.tax_rate_id },
      })
      .returning();

    return {
      success: true,
      message: `Successfully processed ${results.length} products`,
      data: results,
    };
  }
  async calculateOrderTaxes(
    customerAddressId: string,
    cartItems: {
      variantId: string;
      quantity: number;
      price: number;
    }[],
    transaction?: DrizzleService,
    company_id?: string,
    domain?: string,
  ) {
    console.log(
      '[FinancesService.calculateOrderTaxes] Request received for company:',
      company_id,
    );
    console.log(
      '[FinancesService.calculateOrderTaxes] Resolving customer state',
    );
    const companyId = domain ? await this.resolveCompanyId(domain) : company_id;
    const tx = transaction ? transaction : this.db;
    if (!companyId) {
      throw new HttpException(
        'Company ID is required for tax calculation',
        HttpStatus.BAD_REQUEST,
      );
    }
    // 1. Fetch Customer's State
    const [customerAddr] = await tx
      .select({ state: address.state })
      .from(address)
      .where(eq(address.id, customerAddressId))
      .limit(1);
    if (!customerAddr || !customerAddr.state) {
      throw new HttpException(
        'Invalid customer address or missing state',
        HttpStatus.BAD_REQUEST,
      );
    }
    const customerState = customerAddr.state.trim().toLowerCase();
    console.log(
      `[FinancesService.calculateOrderTaxes] Customer state resolved: ${customerState}`,
    );

    // 2. Fetch Vendor's Active GST Registration State
    console.log(
      '[FinancesService.calculateOrderTaxes] Resolving vendor GST registration',
    );
    const [vendorGst] = await tx
      .select()
      .from(gst_registrations)
      .where(
        and(
          eq(gst_registrations.company_id, companyId),
          eq(gst_registrations.is_default, true),
        ),
      )
      .catch((err) => {
        console.error(
          '[FinancesService.calculateOrderTaxes] Error fetching vendor GST registration:',
          err,
        );
        throw new HttpException(
          'Error fetching vendor GST registration',
          HttpStatus.INTERNAL_SERVER_ERROR,
          { cause: err },
        );
      });
    if (!vendorGst || !vendorGst.state_code) {
      throw new HttpException(
        'Vendor GST configuration is missing',
        HttpStatus.BAD_REQUEST,
      );
    }
    console.log(
      `[FinancesService.calculateOrderTaxes] Vendor GST state code resolved: ${vendorGst.state_code}`,
    );

    // In India, state_code in GSTIN indicates the state.
    const vendorState = getStateByCode(vendorGst.state_code)
      ?.state.trim()
      .toLowerCase();

    const isIntraState = customerState === vendorState;

    // 3. Initialize Math Variables
    let subTotal = 0; // total as received (tax-inclusive)
    let netSubTotal = 0; // subtotal after extracting tax
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    let totalTax = 0;

    // We need to collect the unique tax_types applied to this order
    // to insert into your `orders_tax` table later.
    const appliedTaxTypeIds = new Set<string>();

    // 4. Loop through cart items and calculate
    for (const item of cartItems) {
      console.log(
        '[FinancesService.calculateOrderTaxes] Calculating tax for cart item',
        {
          variantId: item.variantId,
          quantity: item.quantity,
        },
      );
      const baseItemTotal = Number(item.price) * item.quantity;
      subTotal += baseItemTotal;
      const [variantRecord] = await tx
        .select({ product_id: product_variants.product_id })
        .from(product_variants)
        .where(eq(product_variants.id, item.variantId))
        .catch((err) => {
          console.error(
            '[FinancesService.calculateOrderTaxes] Error fetching product variant for tax calculation:',
            err,
          );
          throw new HttpException(
            `Error fetching product variant for tax calculation: ${err.message}`,
            HttpStatus.INTERNAL_SERVER_ERROR,
            { cause: err },
          );
        });

      if (!variantRecord || !variantRecord.product_id) {
        throw new HttpException(
          `Product variant not found for ID: ${item.variantId}`,
          HttpStatus.BAD_REQUEST,
        );
      }
      // Fetch the tax rate mapped to this specific product, INCLUDING the tax_type_id
      const productTaxMapping = await tx
        .select({
          rate: tax_rates.tax_rate_value,
          taxTypeId: tax_rates.tax_type_id,
        })
        .from(product_tax)
        .leftJoin(tax_rates, eq(product_tax.tax_rate_id, tax_rates.id))
        .where(eq(product_tax.product_id, variantRecord.product_id))
        .limit(1);

      const mapping = productTaxMapping[0];

      const taxPercentage = mapping ? Number(mapping.rate) : 0;
      console.log(
        `[FinancesService.calculateOrderTaxes] Applied tax percentage: ${taxPercentage}`,
      );

      if (mapping && mapping.taxTypeId) {
        appliedTaxTypeIds.add(mapping.taxTypeId);
      }

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

    // 5. Return the finalized financial breakdown shaped for your schema
    return {
      subTotal: Number(netSubTotal.toFixed(2)), // ex-tax subtotal
      totalCgst: Number(totalCgst.toFixed(2)),
      totalSgst: Number(totalSgst.toFixed(2)),
      totalIgst: Number(totalIgst.toFixed(2)),
      totalTax: Number(totalTax.toFixed(2)),
      grandTotal: Number(subTotal.toFixed(2)), // = netSubTotal + totalTax (same as original price)
      vendorGstId: vendorGst.id,
      appliedTaxTypeIds: Array.from(appliedTaxTypeIds),
    };
  }
}
