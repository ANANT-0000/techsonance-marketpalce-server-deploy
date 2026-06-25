import { Injectable, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import {
  company,
  orders,
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
} from './constants/shipping.constants';
import {
  ShiprocketCreateOrderResponse,
  ShiprocketWebhookBody,
} from 'src/common/Types/shiprocket';

// Strict, non-nullable contracts for shipping details
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

    // 1. Validation Boundary check (Fail-Fast)
    const validatedOrder = ShippingValidationMapper.validateAndMap(
      orderDetail,
      pickupLocation,
    );

    // 2. Perform calculations on strictly-validated structures
    const maxDimension = validatedOrder.items.reduce(
      (acc, item) => ({
        length: Math.max(acc.length, item.length_cm),
        width: Math.max(acc.width, item.width_cm),
        height: Math.max(acc.height, item.height_cm),
      }),
      { length: 0, width: 0, height: 0 },
    );

    const totalWeight = validatedOrder.items.reduce(
      (sum, item) => sum + item.weight_kg * item.units,
      0,
    );

    const orderDate = validatedOrder.created_at
      .toISOString()
      .slice(0, 16)
      .replace('T', ' ');

    const shiprocketPayload = {
      order_id: validatedOrder.order_id,
      order_date: orderDate,
      pickup_location: validatedOrder.pickup_location_id,
      billing_customer_name: validatedOrder.customer.first_name,
      billing_last_name: validatedOrder.customer.last_name,
      billing_address: validatedOrder.address.address_line_1,
      billing_address_2: validatedOrder.address.street,
      billing_city: validatedOrder.address.city,
      billing_pincode: Number(validatedOrder.address.postal_code),
      billing_state: validatedOrder.address.state,
      billing_country: validatedOrder.address.country,
      billing_email: validatedOrder.customer.email,
      billing_phone: Number(validatedOrder.customer.phone),
      shipping_is_billing: true,
      shipping_customer_name: validatedOrder.customer.first_name,
      shipping_last_name: validatedOrder.customer.last_name,
      shipping_address: validatedOrder.address.address_line_1,
      shipping_address_2: validatedOrder.address.street,
      shipping_city: validatedOrder.address.city,
      shipping_pincode: Number(validatedOrder.address.postal_code),
      shipping_state: validatedOrder.address.state,
      shipping_country: validatedOrder.address.country,
      shipping_email: validatedOrder.customer.email,
      shipping_phone: Number(validatedOrder.customer.phone),
      order_items: validatedOrder.items.map((item) => ({
        name: item.name,
        sku: item.sku,
        units: item.units,
        selling_price: item.selling_price,
      })),
      payment_method: SHIPPING_PAYMENT_METHOD_PREPAID,
      sub_total: validatedOrder.total_amount,
      length: maxDimension.length,
      breadth: maxDimension.width,
      height: maxDimension.height,
      weight: totalWeight,
    };

    let draftRes: ShiprocketCreateOrderResponse;
    try {
      draftRes = await this.shipRocketService.createDraftOrder(
        shiprocketPayload,
        strategy.credentials,
        companyId,
      );
      // Log successful order draft creation in audit_logs
      await this.db
        .insert(audit_logs)
        .values({
          action: SHIPROCKET_DRAFT_ORDER_SUCCESS_ACTION,
          entity: SHIPPING_ENTITY_ORDERS,
          entity_id: orderId,
          details: draftRes,
          company_id: companyId,
        })
        .catch((error) => {});
    } catch (err: any) {
      // Log failed order draft creation in audit_logs
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
        .catch((error) => {});
      return null;
    }

    const shipmentId = draftRes?.shipment_id || draftRes?.order_id || null;

    // Create ledger entry
    await this.db
      .insert(shipping_details)
      .values({
        order_id: orderId,
        company_id: companyId,
        logistics_provider: LogisticsProvider.SHIPROCKET,
        billing_account_used:
          strategy.logisticsMode === LogisticsMode.STANDALONE
            ? BillingAccountUsed.VENDOR_OWN
            : BillingAccountUsed.PLATFORM_MASTER,
        logistics_order_id: shipmentId ? String(shipmentId) : null,
        awb_number: null,
        shipping_status: ShippingStatus.PENDING,
        actual_shipping_cost: null,
        weight_discrepancy_charge: ZERO_PRICE_STRING,
      })
      .catch((error) => {});

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
      await this.db
        .update(shipping_details)
        .set({
          awb_number: awbCode,
          courier_name: courierName || LOGISTICS_PARTNER_FALLBACK_NAME,
          shipping_status: SHIPPING_STATUS_AWB_ASSIGNED,
          tracking_url: `https://www.shiprocket.in/shipment-tracking/${awbCode}`,
        })
        .where(eq(shipping_details.id, shipDetail.id));

      await this.db
        .update(orders)
        .set({ order_status: OrderStatus.SHIPPED })
        .where(eq(orders.id, orderId));
    }

    return awbRes;
  }

  async handleWebhookUpdate(payload: ShiprocketWebhookBody): Promise<any> {
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
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

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
          const [inserted] = await this.db
            .insert(shipping_details)
            .values({
              order_id: order.id,
              company_id: order.company_id,
              logistics_provider: LogisticsProvider.SHIPROCKET,
              billing_account_used: BillingAccountUsed.PLATFORM_MASTER,
              logistics_order_id: payload.sr_order_id ? String(payload.sr_order_id) : null,
              awb_number: awb,
              courier_name: payload.courier_name || LOGISTICS_PARTNER_FALLBACK_NAME,
              shipping_status: ShippingStatus.PENDING,
            })
            .returning();
          shipDetail = inserted;
        }
      }
    }

    // 3. Fallback for testing/demo: if shipDetail is still not resolved, query the latest order
    if (!shipDetail) {
      const [latestOrder] = await this.db
        .select()
        .from(orders)
        .orderBy(desc(orders.created_at))
        .limit(1);

      if (latestOrder) {
        const [existingDetail] = await this.db
          .select()
          .from(shipping_details)
          .where(eq(shipping_details.order_id, latestOrder.id))
          .limit(1);
        shipDetail = existingDetail;

        if (!shipDetail) {
          const [inserted] = await this.db
            .insert(shipping_details)
            .values({
              order_id: latestOrder.id,
              company_id: latestOrder.company_id,
              logistics_provider: LogisticsProvider.SHIPROCKET,
              billing_account_used: BillingAccountUsed.PLATFORM_MASTER,
              logistics_order_id: payload.sr_order_id ? String(payload.sr_order_id) : null,
              awb_number: awb,
              courier_name: payload.courier_name || LOGISTICS_PARTNER_FALLBACK_NAME,
              shipping_status: ShippingStatus.PENDING,
            })
            .returning();
          shipDetail = inserted;
        } else {
          await this.db
            .update(shipping_details)
            .set({
              awb_number: awb,
              courier_name: payload.courier_name || LOGISTICS_PARTNER_FALLBACK_NAME,
            })
            .where(eq(shipping_details.id, shipDetail.id));
          shipDetail.awb_number = awb;
          shipDetail.courier_name = payload.courier_name || LOGISTICS_PARTNER_FALLBACK_NAME;
        }
      }
    }

    if (!shipDetail) {
      throw new HttpException(
        `Shipment ledger entry for AWB ${awb} could not be resolved or created`,
        HttpStatus.NOT_FOUND,
      );
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
      .catch((error) => {});

    const updates: Partial<typeof shipping_details.$inferInsert> = {};

    // 1. Check for weight dispute penalties
    // const isDispute = !!payload?.dispute;
    // const weightDiscrepancyCharge = payload?.weight_discrepancy_charge;
    // if (weightDiscrepancyCharge !== undefined) {
    //   // Only lock discrepancy charge for PLATFORM_PROXY orders
    //   if (
    //     shipDetail.billing_account_used === BillingAccountUsed.PLATFORM_MASTER
    //   ) {
    //     updates.weight_discrepancy_charge = String(weightDiscrepancyCharge);
    //   }
    // }

    // // 2. Check for actual shipping cost updates
    // const cost = payload?.actual_shipping_cost;
    // if (cost !== undefined) {
    //   updates.actual_shipping_cost = String(cost);
    // }

    // 3. Status mappings
    const status = payload.current_status;
    if (status) {
      updates.shipping_status = status;

      // Update Order Status on terminal states
      if (shipDetail.order_id) {
        if (status === ShippingStatus.DELIVERED) {
          await this.db
            .update(orders)
            .set({ order_status: OrderStatus.DELIVERED })
            .where(eq(orders.id, shipDetail.order_id));
        } else if (
          status === ShippingStatus.RETURNED ||
          status === ShippingStatus.RTO
        ) {
          await this.db
            .update(orders)
            .set({ order_status: OrderStatus.RETURNED })
            .where(eq(orders.id, shipDetail.order_id));
        } else if (status === ShippingStatus.CANCELLED) {
          await this.db
            .update(orders)
            .set({ order_status: OrderStatus.CANCELLED })
            .where(eq(orders.id, shipDetail.order_id));
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      await this.db
        .update(shipping_details)
        .set(updates)
        .where(eq(shipping_details.id, shipDetail.id));
    }

    return { success: true, updatedFields: Object.keys(updates) };
  }
}
