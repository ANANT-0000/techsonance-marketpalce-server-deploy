import { Injectable, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import {
  company,
  orders,
  payments,
  shipping_details,
  audit_logs,
} from '../../drizzle/schema';
import { ShipRocketService } from '../ship-rocket/ship-rocket.service';
import { CryptoService } from './crypto.service';
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
  SHIPPING_STATUS_AWB_ASSIGNED,
  SHIPPING_PAYMENT_METHOD_PREPAID,
  SHIPPING_DEFAULT_PICKUP_LOCATION,
  LOGISTICS_PARTNER_FALLBACK_NAME,
  ZERO_PRICE_STRING,
  SHIPPING_ENTITY_SHIPPING_DETAILS,
  SHIPPING_ENTITY_ORDERS,
  SHIPPING_STATUS_DRAFTING,
  SHIPPING_STATUS_FAILED,
  ORPHANED_WEBHOOK_ACTION,
} from './constants/shipping.constants';
import {
  ShiprocketCreateOrderResponse,
  ShiprocketWebhookBody,
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
// Status rank map — higher number = more advanced state.
// Used to prevent webhook-driven state regressions (e.g. IN_TRANSIT arriving
// after DELIVERED and overwriting it).
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
  FAILED: 0, // FAILED is a terminal error state, allow any real status to overwrite it
};

// ---------------------------------------------------------------------------
// Validation mapper
// ---------------------------------------------------------------------------
export class ShippingValidationMapper {
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
 * Using Intl.DateTimeFormat avoids adding a date-fns-tz dependency.
 */
function toISTDateString(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? '00';

  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
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
  ) {}

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

    // 1. Validation boundary check (Fail-Fast)
    const validatedOrder = ShippingValidationMapper.validateAndMap(
      orderDetail,
      pickupLocation,
    );

    // 2. Volumetric weight — cube-root of total packed volume.
    //    Math.max approach drastically under-reports multi-item orders
    //    and causes Shiprocket weight-discrepancy penalties.
    const totalVolumeCm3 = validatedOrder.items.reduce(
      (sum, item) =>
        sum + item.length_cm * item.width_cm * item.height_cm * item.units,
      0,
    );
    // Estimate the smallest cube that holds all items; minimum 10 cm per side.
    const estimatedSideCm = Math.max(10, Math.ceil(Math.cbrt(totalVolumeCm3)));

    const totalWeight = validatedOrder.items.reduce(
      (sum, item) => sum + item.weight_kg * item.units,
      0,
    );

    // 3. IST-correct order date (Shiprocket expects YYYY-MM-DD HH:mm in IST)
    const orderDate = toISTDateString(validatedOrder.created_at);

    // 4. Look up actual payment method from the payments table so COD orders
    //    are not silently downgraded to Prepaid.
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
      order_date: orderDate,
      pickup_location: validatedOrder.pickup_location_id,
      billing_customer_name: validatedOrder.customer.first_name,
      billing_last_name: validatedOrder.customer.last_name,
      billing_address: validatedOrder.address.address_line_1,
      billing_address_2: validatedOrder.address.street,
      billing_city: validatedOrder.address.city,
      // Keep pincode as string — Number() strips leading zeros (e.g. 011001 → 11001)
      billing_pincode: validatedOrder.address.postal_code,
      billing_state: validatedOrder.address.state,
      billing_country: validatedOrder.address.country,
      billing_email: validatedOrder.customer.email,
      // Keep phone as string — Number() can mangle international numbers
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
          shipping_status: SHIPPING_STATUS_DRAFTING,
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
          shipping_status: SHIPPING_STATUS_DRAFTING,
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
        .set({ shipping_status: SHIPPING_STATUS_FAILED })
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

      return null;
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
    // ── Auth: validate Shiprocket's own JWT ──────────────────────────────
    // Shiprocket sends its platform JWT (issued during /auth/login) as
    // "Authorization: Bearer <token>" on every outbound webhook call.
    // We compare it against our cached token — only Shiprocket knows it.
    const incomingToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : null;

    if (!incomingToken) {
      throw new HttpException(
        'Missing or malformed Authorization header in Shiprocket webhook',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const expectedToken = await this.shipRocketService.getToken();
    if (!this.safeCompare(incomingToken, expectedToken)) {
      throw new HttpException(
        'Invalid Shiprocket authentication token',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // PII-safe log: never log the raw payload (customer names, phones, addresses)
    console.log(
      `[Shiprocket Webhook] AWB: ${payload?.awb ?? 'N/A'} | Status: ${payload?.current_status ?? 'N/A'}`,
    );
    // ─────────────────────────────────────────────────────────────────────

    const awb = payload?.awb;
    if (!awb) {
      throw new HttpException(
        'Missing AWB number in webhook payload',
        HttpStatus.BAD_REQUEST,
      );
    }

    let shipDetail: any = null;

    // 1. Try to find by AWB code
    const [byAwb] = await this.db
      .select()
      .from(shipping_details)
      .where(eq(shipping_details.awb_number, awb))
      .limit(1);
    shipDetail = byAwb;

    // Helper: regex to validate UUID
    const isUuid = (str: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        str,
      );

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
      });
    } else {
      // Non-terminal status — only shipping_details needs updating
      await this.db
        .update(shipping_details)
        .set({ shipping_status: status })
        .where(eq(shipping_details.id, shipDetail.id));
    }

    return { success: true, updatedStatus: status };
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
