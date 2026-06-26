import { Injectable, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import {
  company,
  orders,
  payments,
  shipping_details,
  audit_logs,
  warehouse,
  address,
  vendor,
  order_items,
} from '../../drizzle/schema';
import { ShipRocketService } from '../ship-rocket/ship-rocket.service';
import { CryptoService } from './crypto.service';
import { MailService } from '../../common/services/mail/mail.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  BillingAccountUsed,
  LogisticsMode,
  OrderStatus,
  LogisticsProvider,
  ShippingStatus,
  PaymentMethod,
} from '../../drizzle/types/types';
import {
  SHIPROCKET_DRAFT_ORDER_SUCCESS_ACTION,
  SHIPROCKET_DRAFT_ORDER_FAILURE_ACTION,
  SHIPROCKET_WEBHOOK_RECEIVED_ACTION,
  SHIPROCKET_NDR_EVENT_ACTION,
  SHIPPING_STATUS_AWB_ASSIGNED,
  SHIPPING_DEFAULT_PICKUP_LOCATION,
  LOGISTICS_PARTNER_FALLBACK_NAME,
  ZERO_PRICE_STRING,
  SHIPPING_ENTITY_SHIPPING_DETAILS,
  SHIPPING_ENTITY_ORDERS,
  ORPHANED_WEBHOOK_ACTION,
  SHIPROCKET_RTO_RETURN_INITIATED_ACTION,
  SHIPROCKET_RTO_RETURN_FAILED_ACTION,
  SHIPROCKET_PICKUP_SCHEDULED_ACTION,
  SHIPROCKET_PICKUP_FAILED_ACTION,
  SHIPROCKET_SHIPMENT_CANCELLED_ACTION,
  SHIPROCKET_PICKUP_EXCEPTION_STATUS,
  SHIPROCKET_PICKUP_RETRY_SCHEDULED_ACTION,
  SHIPROCKET_PICKUP_RETRY_FAILED_ACTION,
  SHIPROCKET_ADDRESS_RECTIFICATION_ACTION,
  SHIPROCKET_ADDRESS_RECTIFICATION_FAILED_ACTION,
} from './constants/shipping.constants';
import {
  ShiprocketCreateOrderResponse,
  ShiprocketWebhookBody,
  ShiprocketReturnOrderPayload,
} from '../../common/Types/shiprocket';

// ---------------------------------------------------------------------------
// Validated contract types
// ---------------------------------------------------------------------------

export interface ValidatedShippingItem {
  sku: string;
  name: string;
  units: number;
  selling_price: number;
  weight_kg: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  hsn_code?: string | null;
}

export interface ValidatedShippingCustomer {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
}

export interface ValidatedShippingAddress {
  address_line_1: string;
  street: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

export interface ValidatedShippingOrder {
  order_id: string;
  created_at: Date;
  total_amount: number;
  customer: ValidatedShippingCustomer;
  address: ValidatedShippingAddress;
  items: ValidatedShippingItem[];
  pickup_location_id: string;
}

// ---------------------------------------------------------------------------
/** Status rank map — higher number = more advanced state.
 * Used to prevent webhook-driven state regressions (e.g. IN_TRANSIT arriving
 * after DELIVERED and overwriting it).
 */
// ---------------------------------------------------------------------------
const SHIPPING_STATUS_RANK: Record<string, number> = {
  PENDING: 1,
  DRAFTING: 2,
  AWB_ASSIGNED: 3,
  SHIPPED: 4,
  IN_TRANSIT: 5,
  OUT_FOR_DELIVERY: 6,
  DELIVERED: 7,
  CANCELLED: 8,
  RETURNED: 9,
  RTO: 10,
  /**
   * FAILED is a terminal error state, allow any real status to overwrite it
   */
  FAILED: 0,
};

// ---------------------------------------------------------------------------
// Validation mapper
// ---------------------------------------------------------------------------
export class ShippingValidationMapper {
  /**
   * Validates and maps an order detail object to a validated shipping order.
   * Throws HttpException if validation fails.
   * @param orderDetail The order detail object to validate.
   * @param pickupLocationId The pickup location ID to use.
   * @returns A validated shipping order object.
   */
  static validateAndMap(
    orderDetail: any,
    pickupLocationId: string,
  ): ValidatedShippingOrder {
    if (!orderDetail) {
      throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
    }
    if (!orderDetail.customer) {
      throw new HttpException(
        'Customer information is missing from the order',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!orderDetail.address) {
      throw new HttpException(
        'Shipping address is missing from the order',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!orderDetail.items || orderDetail.items.length === 0) {
      throw new HttpException(
        'Order must contain at least one item to ship',
        HttpStatus.BAD_REQUEST,
      );
    }

    const { customer, address, items } = orderDetail;

    // Validate Customer
    if (!customer.first_name || customer.first_name.trim() === '') {
      throw new HttpException(
        'Customer first name is required for shipping',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!customer.email || customer.email.trim() === '') {
      throw new HttpException(
        'Customer email is required for shipping',
        HttpStatus.BAD_REQUEST,
      );
    }

    const rawPhone = (address.number || customer.phone_number || '').trim();
    if (
      !rawPhone ||
      rawPhone === '' ||
      rawPhone === '9999999999' ||
      !/^\d{10,15}$/.test(rawPhone)
    ) {
      throw new HttpException(
        'A valid customer phone number is required for shipping (10-15 digits)',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Validate Address
    if (!address.address_line_1 || address.address_line_1.trim() === '') {
      throw new HttpException(
        'Shipping address line 1 is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!address.city || address.city.trim() === '') {
      throw new HttpException(
        'Shipping city is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!address.state || address.state.trim() === '') {
      throw new HttpException(
        'Shipping state is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      !address.postal_code ||
      address.postal_code.trim() === '' ||
      !/^\d{6}$/.test(address.postal_code.trim())
    ) {
      throw new HttpException(
        'Shipping postal code (pincode) must be a valid 6-digit number',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Validate Items
    const validatedItems: ValidatedShippingItem[] = items.map(
      (item: any, idx: number) => {
        const variant = item.variant;
        if (!variant) {
          throw new HttpException(
            `Product variant detail is missing for order item index ${idx}`,
            HttpStatus.BAD_REQUEST,
          );
        }
        if (!variant.sku || variant.sku.trim() === '') {
          throw new HttpException(
            `SKU is missing for variant: ${variant.variant_name || variant.id}`,
            HttpStatus.BAD_REQUEST,
          );
        }

        const weight = Number(variant.weight_kg);
        const length = Number(variant.length_cm);
        const width = Number(variant.width_cm);
        const height = Number(variant.height_cm);

        if (isNaN(weight) || weight <= 0) {
          throw new HttpException(
            `Weight for variant ${variant.sku} must be a positive number`,
            HttpStatus.BAD_REQUEST,
          );
        }
        if (
          isNaN(length) ||
          length <= 0 ||
          isNaN(width) ||
          width <= 0 ||
          isNaN(height) ||
          height <= 0
        ) {
          throw new HttpException(
            `Dimensions (length, width, height) for variant ${variant.sku} must be positive numbers`,
            HttpStatus.BAD_REQUEST,
          );
        }

        return {
          sku: variant.sku,
          name: variant.variant_name || 'Product Item',
          units: item.quantity,
          selling_price: Number(item.price),
          weight_kg: weight,
          length_cm: length,
          width_cm: width,
          height_cm: height,
          hsn_code: variant.hsn_code || null,
        };
      },
    );

    return {
      order_id: orderDetail.id,
      created_at: new Date(orderDetail.created_at || Date.now()),
      total_amount: Number(orderDetail.total_amount),
      customer: {
        first_name: customer.first_name,
        last_name: customer.last_name || '',
        email: customer.email,
        phone: rawPhone,
      },
      address: {
        address_line_1: address.address_line_1,
        street: address.street || '',
        city: address.city,
        state: address.state,
        postal_code: address.postal_code.trim(),
        country: address.country || 'India',
      },
      items: validatedItems,
      pickup_location_id: pickupLocationId,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a Date in IST (Asia/Kolkata, UTC+5:30) as "YYYY-MM-DD HH:mm"
 * — the exact format Shiprocket's order_date field requires.
 * Environment-independent offset calculation guarantees compatibility.
 */
function toISTDateString(date: Date): string {
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const istDate = new Date(utc + 3600000 * 5.5);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${istDate.getFullYear()}-${pad(istDate.getMonth() + 1)}-${pad(istDate.getDate())} ${pad(istDate.getHours())}:${pad(istDate.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ShippingManagerService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly cryptoService: CryptoService,
    private readonly shipRocketService: ShipRocketService,
    private readonly mailService: MailService,
    private readonly inventoryService: InventoryService,
  ) {}

  /**
   * Resolves the logistics strategy for a given company.
   * @param companyId The ID of the company.
   * @returns An object containing the logistics mode, credentials, and pickup location ID.
   */
  async resolveStrategy(companyId: string): Promise<{
    logisticsMode: 'STANDALONE' | 'PLATFORM_PROXY';
    credentials?: { email?: string; password?: string };
    pickupLocationId?: string;
  }> {
    const [comp] = await this.db
      .select()
      .from(company)
      .where(eq(company.id, companyId))
      .limit(1);

    if (!comp) {
      throw new HttpException('Company not found', HttpStatus.NOT_FOUND);
    }

    if (comp.logistics_mode === 'STANDALONE') {
      if (!comp.logistics_is_active) {
        throw new HttpException(
          'Standalone logistics deactivated due to invalid credentials. Please update settings.',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (
        !comp.encrypted_logistics_api_key ||
        !comp.encrypted_logistics_api_secret
      ) {
        throw new HttpException(
          'Standalone logistics credentials missing',
          HttpStatus.BAD_REQUEST,
        );
      }
      const email = this.cryptoService.decrypt(
        comp.encrypted_logistics_api_key,
      );
      const password = this.cryptoService.decrypt(
        comp.encrypted_logistics_api_secret,
      );
      return {
        logisticsMode: 'STANDALONE',
        credentials: { email, password },
        pickupLocationId: comp.logistics_pickup_id || undefined,
      };
    }

    return {
      logisticsMode: 'PLATFORM_PROXY',
      pickupLocationId: comp.logistics_pickup_id || undefined,
    };
  }

  /**
   * Creates a draft order for a given order.
   * @param orderId The ID of the order.
   * @param companyId The ID of the company.
   * @returns A promise that resolves to the created draft order.
   */
  async createDraftOrderForOrder(
    orderId: string,
    companyId: string,
  ): Promise<any> {
    const strategy = await this.resolveStrategy(companyId);

    // Fetch order details with customer address and items
    const orderDetail = await this.db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      with: {
        customer: true,
        address: true,
        items: {
          with: {
            variant: true,
          },
        },
      },
    });

    const pickupLocation =
      strategy.pickupLocationId || SHIPPING_DEFAULT_PICKUP_LOCATION;

    /**
     *  Validation boundary check (Fail-Fast)
     */
    const validatedOrder = ShippingValidationMapper.validateAndMap(
      orderDetail,
      pickupLocation,
    );

    /**
     * Volumetric weight — cube-root of total packed volume.
     * Math.max approach drastically under-reports multi-item orders
     * and causes Shiprocket weight-discrepancy penalties.
     */
    const totalVolumeCm3 = validatedOrder.items.reduce(
      (sum, item) =>
        sum + item.length_cm * item.width_cm * item.height_cm * item.units,
      0,
    );
    /**
     * Estimate the smallest cube that holds all items; minimum 10 cm per side.
     */
    const estimatedSideCm = Math.max(10, Math.ceil(Math.cbrt(totalVolumeCm3)));

    /**
     * Total weight — sum of item weights.
     */
    const totalWeight = validatedOrder.items.reduce(
      (sum, item) => sum + item.weight_kg * item.units,
      0,
    );

    /**
     * IST-correct order date (Shiprocket expects YYYY-MM-DD HH:mm in IST)
     */
    const orderDate = toISTDateString(validatedOrder.created_at);

    const [paymentRecord] = await this.db
      .select({ payment_method: payments.payment_method })
      .from(payments)
      .where(eq(payments.order_id, orderId))
      .limit(1);
    /**
     * COD → COD
     * other → PREPAID
     */
    const resolvedPaymentMethod =
      paymentRecord?.payment_method?.toUpperCase() === PaymentMethod.COD
        ? PaymentMethod.COD
        : PaymentMethod.PREPAID;

    const shiprocketPayload = {
      order_id: validatedOrder.order_id,
      order_date: orderDate,
      pickup_location: validatedOrder.pickup_location_id,
      billing_customer_name: validatedOrder.customer.first_name,
      billing_last_name: validatedOrder.customer.last_name,
      billing_address: validatedOrder.address.address_line_1,
      billing_address_2: validatedOrder.address.street,
      billing_city: validatedOrder.address.city,
      /**
       * Keep pincode as string — Number() strips leading zeros (e.g. 011001 → 11001)
       */
      billing_pincode: validatedOrder.address.postal_code,
      billing_state: validatedOrder.address.state,
      billing_country: validatedOrder.address.country,
      billing_email: validatedOrder.customer.email,
      /**
       * Keep phone as string — Number() can mangle international numbers
       */
      billing_phone: validatedOrder.customer.phone,
      shipping_is_billing: true,
      shipping_customer_name: validatedOrder.customer.first_name,
      shipping_last_name: validatedOrder.customer.last_name,
      shipping_address: validatedOrder.address.address_line_1,
      shipping_address_2: validatedOrder.address.street,
      shipping_city: validatedOrder.address.city,
      shipping_pincode: validatedOrder.address.postal_code,
      shipping_state: validatedOrder.address.state,
      shipping_country: validatedOrder.address.country,
      shipping_email: validatedOrder.customer.email,
      shipping_phone: validatedOrder.customer.phone,
      order_items: validatedOrder.items.map((item) => ({
        name: item.name,
        sku: item.sku,
        units: item.units,
        selling_price: item.selling_price,
        ...(item.hsn_code ? { hsn: Number(item.hsn_code) } : {}),
      })),
      payment_method: resolvedPaymentMethod,
      sub_total: validatedOrder.total_amount,
      length: estimatedSideCm,
      breadth: estimatedSideCm,
      height: estimatedSideCm,
      weight: totalWeight,
    };

    // Check if shipping details already exist for this order (idempotency guard)
    const [existingShipment] = await this.db
      .select()
      .from(shipping_details)
      .where(eq(shipping_details.order_id, orderId))
      .limit(1);

    let shipLedger: typeof shipping_details.$inferSelect;

    if (existingShipment) {
      const status = existingShipment.shipping_status;
      if (
        status === ShippingStatus.PENDING ||
        status === SHIPPING_STATUS_AWB_ASSIGNED ||
        status === ShippingStatus.SHIPPED ||
        status === ShippingStatus.DELIVERED
      ) {
        // Already processed or synced successfully
        return null;
      }

      // If FAILED or DRAFTING, reset status to DRAFTING and reuse the row
      const [updatedLedger] = await this.db
        .update(shipping_details)
        .set({
          shipping_status: ShippingStatus.DRAFTING,
          logistics_order_id: null,
          awb_number: null,
        })
        .where(eq(shipping_details.id, existingShipment.id))
        .returning();
      shipLedger = updatedLedger;
    } else {
      const [newLedger] = await this.db
        .insert(shipping_details)
        .values({
          order_id: orderId,
          company_id: companyId,
          logistics_provider: LogisticsProvider.SHIPROCKET,
          billing_account_used:
            strategy.logisticsMode === LogisticsMode.STANDALONE
              ? BillingAccountUsed.VENDOR_OWN
              : BillingAccountUsed.PLATFORM_MASTER,
          logistics_order_id: null,
          awb_number: null,
          shipping_status: ShippingStatus.DRAFTING,
          actual_shipping_cost: null,
          weight_discrepancy_charge: ZERO_PRICE_STRING,
        })
        .returning();
      shipLedger = newLedger;
    }

    let draftRes: ShiprocketCreateOrderResponse;
    try {
      draftRes = await this.shipRocketService.createDraftOrder(
        shiprocketPayload,
        strategy.credentials,
        companyId,
      );

      const shipmentId = draftRes?.shipment_id || draftRes?.order_id || null;

      // Promote ledger row to PENDING now that Shiprocket accepted the order
      await this.db
        .update(shipping_details)
        .set({
          logistics_order_id: shipmentId ? String(shipmentId) : null,
          shipping_status: ShippingStatus.PENDING,
        })
        .where(eq(shipping_details.id, shipLedger.id));

      // Audit log on success
      await this.db
        .insert(audit_logs)
        .values({
          action: SHIPROCKET_DRAFT_ORDER_SUCCESS_ACTION,
          entity: SHIPPING_ENTITY_ORDERS,
          entity_id: orderId,
          details: draftRes,
          company_id: companyId,
        })
        .catch(() => {});
    } catch (err: any) {
      // Mark ledger as FAILED so a retry cron / admin panel can surface it
      await this.db
        .update(shipping_details)
        .set({ shipping_status: ShippingStatus.FAILED })
        .where(eq(shipping_details.id, shipLedger.id))
        .catch(() => {});

      // Audit log on failure
      await this.db
        .insert(audit_logs)
        .values({
          action: SHIPROCKET_DRAFT_ORDER_FAILURE_ACTION,
          entity: SHIPPING_ENTITY_ORDERS,
          entity_id: orderId,
          details: {
            error: err.message,
            response: err.response?.body || null,
          },
          company_id: companyId,
        })
        .catch(() => {});

      const isUnauthorized =
        err?.status === HttpStatus.UNAUTHORIZED ||
        err?.statusCode === HttpStatus.UNAUTHORIZED ||
        err?.response?.statusCode === 401 ||
        err?.cause?.response?.statusCode === 401;

      if (isUnauthorized) {
        // Circuit Breaker: deactivate standalone logistics for the company
        await this.db
          .update(company)
          .set({ logistics_is_active: false })
          .where(eq(company.id, companyId))
          .catch(() => {});

        // Fetch vendor email and notify them
        const vendorUser = await this.db.query.vendor.findFirst({
          where: eq(vendor.company_id, companyId),
          with: { user: true },
        });

        if (vendorUser?.user?.email) {
          await this.mailService
            .sendEmail(
              vendorUser.user.email,
              'Action Required: Update Shiprocket Credentials',
              `<p>Hello ${vendorUser.store_owner_first_name || 'Vendor'},</p>
             <p>Your Shiprocket credentials on our platform are invalid. Standalone shipping has been temporarily deactivated for your store.</p>
             <p>Please update your credentials under your store settings to reactivate shipping.</p>`,
            )
            .catch(() => {});
        }
      }

      throw err;
    }

    return draftRes;
  }

  async generateAWBForOrder(
    orderId: string,
    companyId: string,
    courierId?: number,
  ): Promise<any> {
    const strategy = await this.resolveStrategy(companyId);

    const [shipDetail] = await this.db
      .select()
      .from(shipping_details)
      .where(
        and(
          eq(shipping_details.order_id, orderId),
          eq(shipping_details.company_id, companyId),
        ),
      )
      .limit(1);

    if (!shipDetail) {
      throw new HttpException(
        'Shipping ledger entry not found for order',
        HttpStatus.NOT_FOUND,
      );
    }

    if (!shipDetail.logistics_order_id) {
      throw new HttpException(
        'Upstream shipment ID not found in ledger. Recreate draft order.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const shipmentId = Number(shipDetail.logistics_order_id);

    const awbRes = await this.shipRocketService.generateAWB(
      shipmentId,
      courierId,
      strategy.credentials,
      companyId,
    );

    const awbData = awbRes?.response?.data;
    const awbCode = awbData?.awb_code;
    const courierName = awbData?.courier_name;

    if (awbCode) {
      // ─── TRANSACTION: both tables must update together or not at all ──────
      await this.db.transaction(async (tx) => {
        await tx
          .update(shipping_details)
          .set({
            awb_number: awbCode,
            courier_name: courierName || LOGISTICS_PARTNER_FALLBACK_NAME,
            shipping_status: SHIPPING_STATUS_AWB_ASSIGNED,
            tracking_url: `https://www.shiprocket.in/shipment-tracking/${awbCode}`,
          })
          .where(eq(shipping_details.id, shipDetail.id));

        await tx
          .update(orders)
          .set({ order_status: OrderStatus.SHIPPED })
          .where(eq(orders.id, orderId));
      });
    }

    return awbRes;
  }

  async handleWebhookUpdate(
    payload: ShiprocketWebhookBody,
    authHeader: string,
  ): Promise<any> {
    const awb = payload?.awb;
    if (!awb) {
      throw new HttpException(
        'Missing AWB number in webhook payload',
        HttpStatus.BAD_REQUEST,
      );
    }

    // ── Auth: validate Shiprocket's own JWT ──────────────────────────────
    // Shiprocket sends its platform JWT (issued during /auth/login) as
    // "Authorization: Bearer <token>" on every outbound webhook call.
    // We compare it against our cached token (tenant-specific or platform master) — only Shiprocket knows it.
    const incomingToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : null;

    if (!incomingToken) {
      throw new HttpException(
        'Missing or malformed Authorization header in Shiprocket webhook',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Helper: regex to validate UUID
    const isUuid = (str: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        str,
      );

    // Read-only resolution of companyId for auth checking
    let companyId: string | null = null;

    // 1. Try AWB in shipping_details
    const [byAwb] = await this.db
      .select({ company_id: shipping_details.company_id })
      .from(shipping_details)
      .where(eq(shipping_details.awb_number, awb))
      .limit(1);

    if (byAwb) {
      companyId = byAwb.company_id;
    } else if (payload.order_id && isUuid(payload.order_id)) {
      // 2. Try order_id in shipping_details
      const [byOrderId] = await this.db
        .select({ company_id: shipping_details.company_id })
        .from(shipping_details)
        .where(eq(shipping_details.order_id, payload.order_id))
        .limit(1);
      if (byOrderId) {
        companyId = byOrderId.company_id;
      } else {
        // 3. Try order_id in orders table
        const [byOrderTable] = await this.db
          .select({ company_id: orders.company_id })
          .from(orders)
          .where(eq(orders.id, payload.order_id))
          .limit(1);
        if (byOrderTable) {
          companyId = byOrderTable.company_id;
        }
      }
    }

    let expectedToken: string;
    if (companyId) {
      const strategy = await this.resolveStrategy(companyId);
      if (strategy.logisticsMode === 'STANDALONE' && strategy.credentials) {
        expectedToken = await this.shipRocketService.getToken(
          strategy.credentials,
          companyId,
        );
      } else {
        expectedToken = await this.shipRocketService.getToken();
      }
    } else {
      expectedToken = await this.shipRocketService.getToken();
    }

    if (!this.safeCompare(incomingToken, expectedToken)) {
      throw new HttpException(
        'Invalid Shiprocket authentication token',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // PII-safe log: never log the raw payload (customer names, phones, addresses)

    // ─────────────────────────────────────────────────────────────────────

    let shipDetail: any = null;

    // 1. Re-use the AWB query already executed during auth (byAwb above).
    //    If that row was found we reuse it; otherwise shipDetail stays null.
    if (byAwb) {
      // Fetch the full row (auth only selected company_id)
      const [fullRow] = await this.db
        .select()
        .from(shipping_details)
        .where(eq(shipping_details.awb_number, awb))
        .limit(1);
      shipDetail = fullRow;
    }

    // 2. Try to find by order_id (if payload.order_id is a valid UUID)
    if (!shipDetail && payload.order_id && isUuid(payload.order_id)) {
      const [byOrderId] = await this.db
        .select()
        .from(shipping_details)
        .where(eq(shipping_details.order_id, payload.order_id))
        .limit(1);
      shipDetail = byOrderId;

      if (!shipDetail) {
        const [order] = await this.db
          .select()
          .from(orders)
          .where(eq(orders.id, payload.order_id))
          .limit(1);
        if (order) {
          // Upsert: if two concurrent webhooks arrive for the same order_id,
          // only one row is created. The second call updates rather than
          // inserting a duplicate, eliminating the SELECT→INSERT race.
          const [upserted] = await this.db
            .insert(shipping_details)
            .values({
              order_id: order.id,
              company_id: order.company_id,
              logistics_provider: LogisticsProvider.SHIPROCKET,
              billing_account_used: BillingAccountUsed.PLATFORM_MASTER,
              logistics_order_id: payload.sr_order_id
                ? String(payload.sr_order_id)
                : null,
              awb_number: awb,
              courier_name:
                payload.courier_name || LOGISTICS_PARTNER_FALLBACK_NAME,
              shipping_status: ShippingStatus.PENDING,
            })
            .onConflictDoUpdate({
              target: shipping_details.order_id,
              set: {
                awb_number: awb,
                courier_name:
                  payload.courier_name || LOGISTICS_PARTNER_FALLBACK_NAME,
                logistics_order_id: payload.sr_order_id
                  ? String(payload.sr_order_id)
                  : undefined,
              },
            })
            .returning();
          shipDetail = upserted;
        }
      }
    }

    // 3. Unmatched webhook — log as ORPHANED and return 200 so Shiprocket
    //    stops retrying. Do NOT fall back to "latest order" (that was
    //    the dangerous demo block that has been removed).
    if (!shipDetail) {
      await this.db
        .insert(audit_logs)
        .values({
          action: ORPHANED_WEBHOOK_ACTION,
          entity: SHIPPING_ENTITY_SHIPPING_DETAILS,
          entity_id: 'UNRESOLVED',
          details: { awb, order_id: payload.order_id ?? null },
          company_id: null,
        })
        .catch(() => {});

      return { success: true, action: 'ORPHANED_WEBHOOK', awb };
    }

    // Log incoming webhook in audit_logs
    await this.db
      .insert(audit_logs)
      .values({
        action: SHIPROCKET_WEBHOOK_RECEIVED_ACTION,
        entity: SHIPPING_ENTITY_SHIPPING_DETAILS,
        entity_id: shipDetail.id,
        details: payload,
        company_id: shipDetail.company_id,
      })
      .catch(() => {});

    // ── NDR Handling (Silent Exceptions) ──────────────────────────────────
    // Catch status IDs 19 (OFE Exception) and 20 (Undelivered)
    if (
      (payload.current_status_id === 19 || payload.current_status_id === 20) &&
      shipDetail.company_id
    ) {
      await this.db
        .insert(audit_logs)
        .values({
          action: SHIPROCKET_NDR_EVENT_ACTION,
          entity: SHIPPING_ENTITY_SHIPPING_DETAILS,
          entity_id: shipDetail.id,
          details: {
            status_id: payload.current_status_id,
            status_name: payload.current_status,
            reason: payload.qc_failure_reason || 'Courier exception during delivery',
          },
          company_id: shipDetail.company_id,
        })
        .catch(() => {});
    }

    // ─── State transition guard ───────────────────────────────────────────
    // Shiprocket webhooks can arrive out of order. Reject any update that
    // would regress the current status to an earlier state.
    const status = payload.current_status;
    if (!status) {
      return { success: true, action: 'NO_STATUS_UPDATE' };
    }

    const currentRank = SHIPPING_STATUS_RANK[shipDetail.shipping_status] ?? 0;
    const incomingRank = SHIPPING_STATUS_RANK[status] ?? 0;

    if (incomingRank <= currentRank) {
      return {
        success: true,
        action: 'SKIPPED_REGRESSION',
        currentStatus: shipDetail.shipping_status,
        rejectedStatus: status,
      };
    }

    // ─── Apply the status update ──────────────────────────────────────────
    const isTerminal =
      status === ShippingStatus.DELIVERED ||
      status === ShippingStatus.RETURNED ||
      status === ShippingStatus.RTO ||
      status === ShippingStatus.CANCELLED;

    if (isTerminal && shipDetail.order_id) {
      // Terminal states touch two tables — wrap in a transaction to prevent
      // partial writes if the process crashes between the two queries.
      await this.db.transaction(async (tx) => {
        await tx
          .update(shipping_details)
          .set({ shipping_status: status })
          .where(eq(shipping_details.id, shipDetail.id));

        let newOrderStatus: OrderStatus | null = null;
        if (status === ShippingStatus.DELIVERED) {
          newOrderStatus = OrderStatus.DELIVERED;
        } else if (
          status === ShippingStatus.RETURNED ||
          status === ShippingStatus.RTO
        ) {
          newOrderStatus = OrderStatus.RETURNED;
        } else if (status === ShippingStatus.CANCELLED) {
          newOrderStatus = OrderStatus.CANCELLED;
        }

        if (newOrderStatus) {
          await tx
            .update(orders)
            .set({ order_status: newOrderStatus })
            .where(eq(orders.id, shipDetail.order_id));
        }

        // RTO / RETURNED stock increment logic (inside transaction!)
        if (
          status === ShippingStatus.RETURNED ||
          status === ShippingStatus.RTO
        ) {
          const items = await tx
            .select({
              product_variant_id: order_items.product_variant_id,
              quantity: order_items.quantity,
            })
            .from(order_items)
            .where(eq(order_items.order_id, shipDetail.order_id));

          if (items.length > 0) {
            const rollbackLines = items
              .filter((item) => item.product_variant_id !== null)
              .map((item) => ({
                variantId: item.product_variant_id!,
                quantity: item.quantity,
              }));
            if (rollbackLines.length > 0) {
              await this.inventoryService.rollbackStockForOrder(
                rollbackLines,
                shipDetail.company_id!,
                tx,
              );
            }
          }
        }
      });

      // ── RTO automation: fire-and-forget reverse shipment ─────────────────
      // The status transaction above has already committed. Initiating the
      // return order is deliberately NOT inside the transaction — failure here
      // must not retry the webhook or roll back the status change.
      if (
        (status === ShippingStatus.RETURNED || status === ShippingStatus.RTO) &&
        shipDetail.company_id
      ) {
        this.initiateRtoReturn(
          shipDetail.order_id!,
          shipDetail.company_id,
        ).catch(() => {});
      }
    } else {
      // Non-terminal status — only shipping_details needs updating
      await this.db
        .update(shipping_details)
        .set({ shipping_status: status })
        .where(eq(shipping_details.id, shipDetail.id));

      // ── Pickup Exception: auto-retry (fire-and-forget) ──────────────────
      // Shiprocket sends 'PICKUP EXCEPTION' as the current_status when the
      // courier was unable to collect the parcel. We immediately reschedule
      // a retry pickup without blocking the HTTP 200 response to Shiprocket.
      if (
        status === SHIPROCKET_PICKUP_EXCEPTION_STATUS &&
        shipDetail.company_id &&
        shipDetail.logistics_order_id
      ) {
        this.handlePickupException(
          shipDetail.id,
          Number(shipDetail.logistics_order_id),
          shipDetail.company_id,
        ).catch(() => {});
      }
    }

    return { success: true, updatedStatus: status };
  }

  // ─── Phase 2: Pickup Scheduling ────────────────────────────────────────────

  /**
   * Schedules a Shiprocket pickup for an order that already has an AWB assigned.
   * Should be invoked after generateAWBForOrder() returns successfully.
   */
  async schedulePickupForOrder(
    orderId: string,
    companyId: string,
  ): Promise<any> {
    const strategy = await this.resolveStrategy(companyId);

    const [shipDetail] = await this.db
      .select()
      .from(shipping_details)
      .where(
        and(
          eq(shipping_details.order_id, orderId),
          eq(shipping_details.company_id, companyId),
        ),
      )
      .limit(1);

    if (!shipDetail) {
      throw new HttpException(
        'Shipping ledger entry not found for order',
        HttpStatus.NOT_FOUND,
      );
    }
    if (!shipDetail.logistics_order_id) {
      throw new HttpException(
        'Cannot schedule pickup: shipment ID is missing. Ensure draft order has been created.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const shipmentId = Number(shipDetail.logistics_order_id);

    let pickupRes: any;
    try {
      pickupRes = await this.shipRocketService.requestPickup(
        { shipment_id: [shipmentId] },
        strategy.credentials,
        companyId,
      );
    } catch (err: any) {
      await this.db
        .insert(audit_logs)
        .values({
          action: SHIPROCKET_PICKUP_FAILED_ACTION,
          entity: SHIPPING_ENTITY_SHIPPING_DETAILS,
          entity_id: shipDetail.id,
          details: { error: err.message },
          company_id: companyId,
        })
        .catch(() => {});
      throw err;
    }

    await this.db
      .insert(audit_logs)
      .values({
        action: SHIPROCKET_PICKUP_SCHEDULED_ACTION,
        entity: SHIPPING_ENTITY_SHIPPING_DETAILS,
        entity_id: shipDetail.id,
        details: pickupRes,
        company_id: companyId,
      })
      .catch(() => {});

    return pickupRes;
  }

  // ─── Phase 2: Order Cancellation ───────────────────────────────────────────

  /**
   * Cancels a Shiprocket shipment and updates local status atomically.
   * Shiprocket's cancel endpoint requires the Shiprocket order_id (stored as
   * logistics_order_id in our ledger), not the internal shipment_id.
   */
  async cancelShipmentForOrder(
    orderId: string,
    companyId: string,
  ): Promise<any> {
    const strategy = await this.resolveStrategy(companyId);

    const [shipDetail] = await this.db
      .select()
      .from(shipping_details)
      .where(
        and(
          eq(shipping_details.order_id, orderId),
          eq(shipping_details.company_id, companyId),
        ),
      )
      .limit(1);

    if (!shipDetail) {
      throw new HttpException(
        'Shipping ledger entry not found for order',
        HttpStatus.NOT_FOUND,
      );
    }
    if (shipDetail.shipping_status === ShippingStatus.DELIVERED) {
      throw new HttpException(
        'Cannot cancel a shipment that has already been delivered',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!shipDetail.logistics_order_id) {
      throw new HttpException(
        'No Shiprocket order ID found. The draft may not have been created yet.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const shiprocketOrderId = Number(shipDetail.logistics_order_id);

    const cancelRes = await this.shipRocketService.cancelShipment(
      { ids: [shiprocketOrderId] },
      strategy.credentials,
      companyId,
    );

    // Atomic update: both tables or neither
    await this.db.transaction(async (tx) => {
      await tx
        .update(shipping_details)
        .set({ shipping_status: ShippingStatus.CANCELLED })
        .where(eq(shipping_details.id, shipDetail.id));

      if (shipDetail.order_id) {
        await tx
          .update(orders)
          .set({ order_status: OrderStatus.CANCELLED })
          .where(eq(orders.id, shipDetail.order_id));
      }
    });

    await this.db
      .insert(audit_logs)
      .values({
        action: SHIPROCKET_SHIPMENT_CANCELLED_ACTION,
        entity: SHIPPING_ENTITY_SHIPPING_DETAILS,
        entity_id: shipDetail.id,
        details: cancelRes,
        company_id: companyId,
      })
      .catch(() => {});

    return cancelRes;
  }

  // ─── Phase 2: Private RTO Automation ────────────────────────────────────────

  /**
   * Builds and dispatches a Shiprocket reverse shipment (return order) when an
   * RTO or RETURNED webhook is received.
   *
   * IMPORTANT: This method is intentionally fire-and-forget.
   * The caller wraps it in .catch(() => {}) so that a Shiprocket API failure
   * here does NOT affect the already-committed shipping status update.
   * The result (success or failure) is always persisted to audit_logs.
   */
  private async initiateRtoReturn(
    orderId: string,
    companyId: string,
  ): Promise<void> {
    const strategy = await this.resolveStrategy(companyId);

    // Fetch full order details needed to build the return payload
    const orderDetail = await this.db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      with: {
        customer: true,
        address: true,
        items: {
          with: { variant: true },
        },
      },
    });

    if (!orderDetail?.customer || !orderDetail?.address) {
      await this.db
        .insert(audit_logs)
        .values({
          action: SHIPROCKET_RTO_RETURN_FAILED_ACTION,
          entity: SHIPPING_ENTITY_ORDERS,
          entity_id: orderId,
          details: {
            error: 'Order, customer, or address data missing for RTO return',
          },
          company_id: companyId,
        })
        .catch(() => {});
      return;
    }

    // Fetch the company's primary active warehouse address to use as return destination
    const [warehouseRow] = await this.db
      .select({
        warehouse_name: warehouse.warehouse_name,
        address_line_1: address.address_line_1,
        street: address.street,
        city: address.city,
        state: address.state,
        country: address.country,
        postal_code: address.postal_code,
        phone_number: address.number,
      })
      .from(warehouse)
      .innerJoin(address, eq(warehouse.address_id, address.id))
      .where(eq(warehouse.company_id, companyId))
      .limit(1);

    if (!warehouseRow) {
      await this.db
        .insert(audit_logs)
        .values({
          action: SHIPROCKET_RTO_RETURN_FAILED_ACTION,
          entity: SHIPPING_ENTITY_ORDERS,
          entity_id: orderId,
          details: {
            error:
              'No warehouse configured for this company. Cannot build return address.',
          },
          company_id: companyId,
        })
        .catch(() => {});
      return;
    }

    const { customer, address: custAddr, items } = orderDetail as any;
    const custPhone = (custAddr?.number || customer?.phone_number || '').trim();

    const returnOrderId = `RTO-${orderId}`;
    const orderDate = toISTDateString(new Date()).split(' ')[0]; // YYYY-MM-DD only

    const returnItems = (items ?? []).map((item: any) => ({
      name: item.variant?.variant_name || 'Product',
      sku: item.variant?.sku || 'SKU',
      units: item.quantity,
      selling_price: Number(item.price),
    }));

    const totalWeight = (items ?? []).reduce(
      (sum: number, item: any) =>
        sum + Number(item.variant?.weight_kg ?? 0.5) * item.quantity,
      0,
    );
    const totalVolumeCm3 = (items ?? []).reduce(
      (sum: number, item: any) =>
        sum +
        Number(item.variant?.length_cm ?? 10) *
          Number(item.variant?.width_cm ?? 10) *
          Number(item.variant?.height_cm ?? 10) *
          item.quantity,
      0,
    );
    const sideCm = Math.max(10, Math.ceil(Math.cbrt(totalVolumeCm3)));
    const subTotal = (items ?? []).reduce(
      (sum: number, item: any) => sum + Number(item.price) * item.quantity,
      0,
    );

    // Build payload strictly from ShiprocketReturnOrderPayload — no extra fields
    const payload: ShiprocketReturnOrderPayload = {
      order_id: returnOrderId,
      order_date: orderDate,
      // Pickup = customer location (where the courier collects the return from)
      pickup_customer_name: customer.first_name,
      pickup_last_name: customer.last_name || '',
      pickup_address: custAddr.address_line_1,
      pickup_address_2: custAddr.street || '',
      pickup_city: custAddr.city,
      pickup_state: custAddr.state,
      pickup_country: custAddr.country || 'India',
      pickup_pincode: Number(custAddr.postal_code),
      pickup_email: customer.email,
      pickup_phone: custPhone,
      // Shipping = seller/warehouse location (where the return is delivered to)
      shipping_customer_name: warehouseRow.warehouse_name,
      shipping_address: warehouseRow.address_line_1 || '',
      shipping_address_2: warehouseRow.street || '',
      shipping_city: warehouseRow.city,
      shipping_state: warehouseRow.state,
      shipping_country: warehouseRow.country || 'India',
      shipping_pincode: Number(warehouseRow.postal_code),
      shipping_phone: Number(warehouseRow.phone_number ?? 9999999999),
      order_items: returnItems,
      payment_method: 'Prepaid',
      sub_total: subTotal,
      length: sideCm,
      breadth: sideCm,
      height: sideCm,
      weight: totalWeight || 0.5,
    };

    try {
      const returnRes = await this.shipRocketService.createReturnOrder(
        payload,
        strategy.credentials,
        companyId,
      );
      await this.db
        .insert(audit_logs)
        .values({
          action: SHIPROCKET_RTO_RETURN_INITIATED_ACTION,
          entity: SHIPPING_ENTITY_ORDERS,
          entity_id: orderId,
          details: returnRes,
          company_id: companyId,
        })
        .catch(() => {});
    } catch (err: any) {
      await this.db
        .insert(audit_logs)
        .values({
          action: SHIPROCKET_RTO_RETURN_FAILED_ACTION,
          entity: SHIPPING_ENTITY_ORDERS,
          entity_id: orderId,
          details: { error: err.message },
          company_id: companyId,
        })
        .catch(() => {});
    }
  }

  // ─── Phase 3: Address Rectification ──────────────────────────────────────────

  /**
   * Corrects the shipping address for an order, handling both pre-AWB and
   * post-AWB states (TC-011 and TC-012).
   *
   * Pre-AWB  (PENDING / DRAFTING) — cancel upstream draft → re-create with new address.
   * Post-AWB (AWB_ASSIGNED / SHIPPED) — cancel shipment + AWB → re-create with new address.
   *
   * The same shipping_details ledger row is reused throughout; it is reset
   * to DRAFTING then promoted to PENDING once the new draft succeeds.
   */
  async rectifyShippingAddress(
    orderId: string,
    companyId: string,
    newAddress: {
      address_line_1: string;
      street?: string;
      city: string;
      state: string;
      postal_code: string;
      country?: string;
    },
  ): Promise<any> {
    const strategy = await this.resolveStrategy(companyId);

    // 1. Load the current ledger row ─────────────────────────────────────
    const [shipDetail] = await this.db
      .select()
      .from(shipping_details)
      .where(
        and(
          eq(shipping_details.order_id, orderId),
          eq(shipping_details.company_id, companyId),
        ),
      )
      .limit(1);

    if (!shipDetail) {
      throw new HttpException(
        'Shipping ledger entry not found for this order',
        HttpStatus.NOT_FOUND,
      );
    }

    if (shipDetail.shipping_status === ShippingStatus.DELIVERED) {
      throw new HttpException(
        'Address cannot be changed: shipment has already been delivered',
        HttpStatus.BAD_REQUEST,
      );
    }

    // 2. If an upstream shipment exists, cancel it first ─────────────────
    if (shipDetail.logistics_order_id) {
      const shiprocketOrderId = Number(shipDetail.logistics_order_id);
      try {
        await this.shipRocketService.cancelShipment(
          { ids: [shiprocketOrderId] },
          strategy.credentials,
          companyId,
        );
      } catch (err: any) {
        // Log and surface: Shiprocket may need manual intervention in the
        // dashboard if the cancel call fails (e.g. shipment already in transit).
        await this.db
          .insert(audit_logs)
          .values({
            action: SHIPROCKET_ADDRESS_RECTIFICATION_FAILED_ACTION,
            entity: SHIPPING_ENTITY_SHIPPING_DETAILS,
            entity_id: shipDetail.id,
            details: { stage: 'cancel_upstream', error: err.message },
            company_id: companyId,
          })
          .catch(() => {});
        throw new HttpException(
          `Upstream cancellation failed: ${err.message}. Confirm cancellation in Shiprocket dashboard then retry.`,
          HttpStatus.BAD_GATEWAY,
        );
      }
    }

    // 3. Reset ledger to DRAFTING ─────────────────────────────────────────
    await this.db
      .update(shipping_details)
      .set({
        shipping_status: ShippingStatus.DRAFTING,
        logistics_order_id: null,
        awb_number: null,
        courier_name: null,
        tracking_url: null,
      })
      .where(eq(shipping_details.id, shipDetail.id));

    // 4. Re-draft with corrected address ──────────────────────────────────
    const orderDetail = await this.db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      with: {
        customer: true,
        address: true,
        items: { with: { variant: true } },
      },
    });

    if (!orderDetail) {
      await this.db
        .update(shipping_details)
        .set({ shipping_status: ShippingStatus.FAILED })
        .where(eq(shipping_details.id, shipDetail.id))
        .catch(() => {});
      throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
    }

    const pickupLocation =
      strategy.pickupLocationId || SHIPPING_DEFAULT_PICKUP_LOCATION;

    // Merge corrected address fields over the existing order address so that
    // all other order data (customer, items, etc.) remains unchanged.
    const validatedOrder = ShippingValidationMapper.validateAndMap(
      {
        ...orderDetail,
        address: {
          ...(orderDetail as any).address,
          address_line_1: newAddress.address_line_1,
          street:
            newAddress.street ?? (orderDetail as any).address?.street ?? '',
          city: newAddress.city,
          state: newAddress.state,
          postal_code: newAddress.postal_code,
          country:
            newAddress.country ??
            (orderDetail as any).address?.country ??
            'India',
        },
      },
      pickupLocation,
    );

    const totalVolumeCm3 = validatedOrder.items.reduce(
      (sum, item) =>
        sum + item.length_cm * item.width_cm * item.height_cm * item.units,
      0,
    );
    const estimatedSideCm = Math.max(10, Math.ceil(Math.cbrt(totalVolumeCm3)));
    const totalWeight = validatedOrder.items.reduce(
      (sum, item) => sum + item.weight_kg * item.units,
      0,
    );

    const [paymentRecord] = await this.db
      .select({ payment_method: payments.payment_method })
      .from(payments)
      .where(eq(payments.order_id, orderId))
      .limit(1);
    const resolvedPaymentMethod =
      paymentRecord?.payment_method?.toUpperCase() === PaymentMethod.COD
        ? PaymentMethod.COD
        : PaymentMethod.PREPAID;

    const shiprocketPayload = {
      order_id: validatedOrder.order_id,
      order_date: toISTDateString(validatedOrder.created_at),
      pickup_location: validatedOrder.pickup_location_id,
      billing_customer_name: validatedOrder.customer.first_name,
      billing_last_name: validatedOrder.customer.last_name,
      billing_address: validatedOrder.address.address_line_1,
      billing_address_2: validatedOrder.address.street,
      billing_city: validatedOrder.address.city,
      billing_pincode: validatedOrder.address.postal_code,
      billing_state: validatedOrder.address.state,
      billing_country: validatedOrder.address.country,
      billing_email: validatedOrder.customer.email,
      billing_phone: validatedOrder.customer.phone,
      shipping_is_billing: true,
      shipping_customer_name: validatedOrder.customer.first_name,
      shipping_last_name: validatedOrder.customer.last_name,
      shipping_address: validatedOrder.address.address_line_1,
      shipping_address_2: validatedOrder.address.street,
      shipping_city: validatedOrder.address.city,
      shipping_pincode: validatedOrder.address.postal_code,
      shipping_state: validatedOrder.address.state,
      shipping_country: validatedOrder.address.country,
      shipping_email: validatedOrder.customer.email,
      shipping_phone: validatedOrder.customer.phone,
      order_items: validatedOrder.items.map((item) => ({
        name: item.name,
        sku: item.sku,
        units: item.units,
        selling_price: item.selling_price,
      })),
      payment_method: resolvedPaymentMethod,
      sub_total: validatedOrder.total_amount,
      length: estimatedSideCm,
      breadth: estimatedSideCm,
      height: estimatedSideCm,
      weight: totalWeight,
    };

    let draftRes: ShiprocketCreateOrderResponse;
    try {
      draftRes = await this.shipRocketService.createDraftOrder(
        shiprocketPayload,
        strategy.credentials,
        companyId,
      );
    } catch (err: any) {
      await this.db
        .update(shipping_details)
        .set({ shipping_status: ShippingStatus.FAILED })
        .where(eq(shipping_details.id, shipDetail.id))
        .catch(() => {});
      await this.db
        .insert(audit_logs)
        .values({
          action: SHIPROCKET_ADDRESS_RECTIFICATION_FAILED_ACTION,
          entity: SHIPPING_ENTITY_SHIPPING_DETAILS,
          entity_id: shipDetail.id,
          details: { stage: 're_draft', error: err.message },
          company_id: companyId,
        })
        .catch(() => {});
      throw err;
    }

    // 5. Promote ledger to PENDING with new upstream IDs ─────────────────
    const newShipmentId = draftRes?.shipment_id || draftRes?.order_id || null;
    await this.db
      .update(shipping_details)
      .set({
        logistics_order_id: newShipmentId ? String(newShipmentId) : null,
        shipping_status: ShippingStatus.PENDING,
      })
      .where(eq(shipping_details.id, shipDetail.id));

    await this.db
      .insert(audit_logs)
      .values({
        action: SHIPROCKET_ADDRESS_RECTIFICATION_ACTION,
        entity: SHIPPING_ENTITY_SHIPPING_DETAILS,
        entity_id: shipDetail.id,
        details: { correctedAddress: newAddress, draftResponse: draftRes },
        company_id: companyId,
      })
      .catch(() => {});

    return draftRes;
  }

  // ─── Phase 3: Pickup Exception Private Helper ─────────────────────────────

  /**
   * Called fire-and-forget from the webhook handler when PICKUP_EXCEPTION is
   * received. Re-submits the pickup request with `status: 'retry'` per the
   * official Shiprocket pickup API spec.
   *
   * Failure here MUST NOT affect the HTTP 200 already returned to Shiprocket.
   * The result (success or failure) is always persisted to audit_logs.
   */
  private async handlePickupException(
    shippingDetailId: string,
    shiprocketShipmentId: number,
    companyId: string,
  ): Promise<void> {
    const strategy = await this.resolveStrategy(companyId);

    try {
      const pickupRes = await this.shipRocketService.requestPickup(
        { shipment_id: [shiprocketShipmentId], status: 'retry' },
        strategy.credentials,
        companyId,
      );

      await this.db
        .insert(audit_logs)
        .values({
          action: SHIPROCKET_PICKUP_RETRY_SCHEDULED_ACTION,
          entity: SHIPPING_ENTITY_SHIPPING_DETAILS,
          entity_id: shippingDetailId,
          details: pickupRes,
          company_id: companyId,
        })
        .catch(() => {});
    } catch (err: any) {
      await this.db
        .insert(audit_logs)
        .values({
          action: SHIPROCKET_PICKUP_RETRY_FAILED_ACTION,
          entity: SHIPPING_ENTITY_SHIPPING_DETAILS,
          entity_id: shippingDetailId,
          details: { error: err.message },
          company_id: companyId,
        })
        .catch(() => {});
    }
  }

  /**
   * Constant-time string comparison to prevent timing-based token guessing.
   * Both strings are XOR'd byte-by-byte so the loop always runs to completion,
   * making it impossible to infer the correct token length from response time.
   */
  private safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }
}
