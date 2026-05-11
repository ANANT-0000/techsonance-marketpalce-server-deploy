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
import { getStateByCode } from 'src/common/state_code';

@Injectable()
export class FinancesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
  ) {}

  async getVendorEarnings(domain: string) {
    try {
      const filteredDomain = domainExtractor(domain);
      const companyId = await this.companyService.find(filteredDomain);

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
      console.error('FinancesService Error: ', error);
      throw new InternalServerErrorException(
        'Error occurred while fetching company earnings via relations',
        { cause: error },
      );
    }
  }
  async getVendorFinancial(vendorId: string) {
    try {
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
      console.error('AdminFinancesService Error: ', error);

      if (error instanceof NotFoundException) throw error;

      throw new InternalServerErrorException(
        'Error occurred while fetching vendor financial ledger',
        { cause: error },
      );
    }
  }
  // 1. GST Registrations
  async getGstRegistrations(domain: string) {
    const filteredDomain = domainExtractor(domain);
    const companyId = await this.companyService.find(filteredDomain);

    const records = await this.db.query.gst_registrations.findMany({
      where: eq(gst_registrations.company_id, companyId),
      orderBy: [desc(gst_registrations.created_at)],
    });
    return { success: true, data: records };
  }

  async addGstRegistration(domain: string, data: any) {
    const filteredDomain = domainExtractor(domain);
    const companyId = await this.companyService.find(filteredDomain);
    console.log(
      'Adding GST Registration for Company ID:',
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

    return {
      success: true,
      message: 'GST Registration added successfully',
      data: newRecord,
    };
  }
  async createTaxProfile(domain: string, data: any) {
    const filteredDomain = domainExtractor(domain);
    const companyId = await this.companyService.find(filteredDomain);

    const newProfile = await this.db
      .insert(tax_profiles)
      .values({
        company_id: companyId,
        profile_type: data.profile_type,
        tax_profile_description: data.tax_profile_description,
        is_default: data.is_default || false,
      })
      .returning();

    return { success: true, message: 'Tax profile created', data: newProfile };
  }

  // 2. Create Tax Rate (Combines Tax Type + Tax Rate insertion)
  async createTaxRate(domain: string, data: any) {
    const filteredDomain = domainExtractor(domain);
    const companyId = await this.companyService.find(filteredDomain);

    // Step A: Insert into tax_types
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

    return {
      success: true,
      message: 'Tax rule created successfully',
      data: newTaxRate,
    };
  }
  // 2. Tax Profiles
  async getTaxProfiles(domain: string) {
    const filteredDomain = domainExtractor(domain);
    const companyId = await this.companyService.find(filteredDomain);

    const records = await this.db.query.tax_profiles.findMany({
      where: eq(tax_profiles.company_id, companyId),
      orderBy: [desc(tax_profiles.created_at)],
    });
    return { success: true, data: records };
  }

  // 3. Tax Rates
  async getTaxRates(domain: string) {
    const filteredDomain = domainExtractor(domain);
    const companyId = await this.companyService.find(filteredDomain);

    const records = await this.db.query.tax_rates.findMany({
      where: eq(tax_rates.company_id, companyId),
      orderBy: [desc(tax_rates.created_at)],
    });
    return { success: true, data: records };
  }

  // 4. Product Tax Mapping (The Bridge)
  async getProductTaxMapping(domain: string) {
    const filteredDomain = domainExtractor(domain);
    const companyId = await this.companyService.find(filteredDomain);

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

    return { success: true, data: formattedData };
  }

  // 5. GST Invoices
  async getGstInvoices(domain: string) {
    const filteredDomain = domainExtractor(domain);
    const companyId = await this.companyService.find(filteredDomain);

    const records = await this.db.query.gst_invoices.findMany({
      where: eq(gst_invoices.company_id, companyId),
      orderBy: [desc(gst_invoices.invoice_date)],
    });
    return { success: true, data: records };
  }
  async getSingleGstRegistration(id: string, domain: string) {
    const filteredDomain = domainExtractor(domain);
    const companyId = await this.companyService.find(filteredDomain);

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
    const filteredDomain = domainExtractor(domain);
    const companyId = await this.companyService.find(filteredDomain);

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

    return {
      success: true,
      message: 'GST updated successfully',
      data: updatedRecord,
    };
  }

  // --- REPEAT PATTERN FOR PROFILES & RATES ---
  async updateTaxProfile(id: string, domain: string, data: any) {
    const filteredDomain = domainExtractor(domain);
    const companyId = await this.companyService.find(filteredDomain);

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

    return { success: true, data: updated };
  }
  // 6. Assign Tax to Product (Upsert Logic)
  async assignTaxToProduct(
    domain: string,
    data: { product_id: string; tax_rate_id: string },
  ) {
    const filteredDomain = domainExtractor(domain);
    const companyId = await this.companyService.find(filteredDomain); // Used for security validation if needed

    // Check if the product already has a tax mapped
    const existingMapping = await this.db.query.product_tax.findFirst({
      where: eq(product_tax.product_id, data.product_id),
    });

    if (existingMapping) {
      // UPDATE existing mapping
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
  async calculateOrderTaxes(
    tx: DrizzleService,
    companyId: string,
    customerAddressId: string,
    cartItems: {
      variantId: string;
      quantity: number;
      price: number;
    }[],
  ) {
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

    // 2. Fetch Vendor's Active GST Registration State
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
        console.error('Error fetching vendor GST registration:', err);
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

    // In India, state_code in GSTIN indicates the state.
    const vendorState = getStateByCode(vendorGst.state_code)
      ?.state.trim()
      .toLowerCase();

    const isIntraState = customerState === vendorState;

    // 3. Initialize Math Variables
    let subTotal = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    let totalTax = 0;

    // We need to collect the unique tax_types applied to this order
    // to insert into your `orders_tax` table later.
    const appliedTaxTypeIds = new Set<string>();

    // 4. Loop through cart items and calculate
    for (const item of cartItems) {
      const baseItemTotal = Number(item.price) * item.quantity;
      subTotal += baseItemTotal;
      const [variantRecord] = await tx
        .select({ product_id: product_variants.product_id })
        .from(product_variants)
        .where(eq(product_variants.id, item.variantId))
        .catch((err) => {
          console.error(
            'Error fetching product variant for tax calculation:',
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

      if (mapping && mapping.taxTypeId) {
        appliedTaxTypeIds.add(mapping.taxTypeId);
      }

      const itemTaxAmount = (baseItemTotal * taxPercentage) / 100;

      // Apply the GST Rules
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
      subTotal: Number(subTotal.toFixed(2)),
      totalCgst: Number(totalCgst.toFixed(2)),
      totalSgst: Number(totalSgst.toFixed(2)),
      totalIgst: Number(totalIgst.toFixed(2)),
      totalTax: Number(totalTax.toFixed(2)),
      grandTotal: Number((subTotal + totalTax).toFixed(2)),
      vendorGstId: vendorGst.id,
      appliedTaxTypeIds: Array.from(appliedTaxTypeIds),
    };
  }
}
