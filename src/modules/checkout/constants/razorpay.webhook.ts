/**
 * Supported Razorpay payment methods received in webhook events.
 */
export enum RazorpayPaymentMethod {
  CARD = 'card',
  NETBANKING = 'netbanking',
  UPI = 'upi',
}

/**
 * Razorpay Order Paid webhook payload.
 */
export interface RazorpayOrderPaidWebhook {
  /** Always "event". */
  entity: 'event';

  /** Razorpay account identifier. */
  account_id: string;

  /** Webhook event name. */
  event: 'order.paid';

  /** Entities included in the payload. */
  contains: ('payment' | 'order')[];

  /** Main webhook data. */
  payload: {
    payment: {
      entity: RazorpayPayment;
    };

    order: {
      entity: RazorpayOrder;
    };
  };

  /** Unix timestamp (seconds) when webhook was generated. */
  created_at: number;
}

/**
 * Generic Razorpay Webhook Event structure for all event types.
 */
export interface RazorpayWebhookEvent {
  entity: 'event';
  account_id: string;
  event: string;
  contains: string[];
  payload: Record<string, any>;
  created_at: number;
}

/**
 * Razorpay Payment Captured webhook payload.
 */
export interface RazorpayPaymentCapturedWebhook {
  /** Always "event". */
  entity: 'event';

  /** Razorpay account identifier. */
  account_id: string;

  /** Webhook event name. */
  event: 'payment.captured';

  /** Entities included in the payload. */
  contains: 'payment'[];

  /** Main webhook data. */
  payload: {
    payment: {
      entity: RazorpayPayment;
    };
  };

  /** Unix timestamp (seconds) when webhook was generated. */
  created_at: number;
}

/**
 * Payment entity.
 *
 * Uses `method` as a discriminated union so TypeScript
 * automatically exposes the correct fields.
 */
export type RazorpayPayment =
  | RazorpayCardPayment
  | RazorpayNetBankingPayment
  | RazorpayUpiPayment;

/**
 * Fields common to every payment method.
 */
interface RazorpayPaymentBase {
  /** Payment identifier. */
  id: string;

  /** Always "payment". */
  entity: 'payment';

  /** Amount paid in the smallest currency unit (paise). */
  amount: number;

  /** Currency code. */
  currency: string;

  /** Payment status. */
  status: string;

  /** Associated Razorpay order ID. */
  order_id: string;

  /** Invoice ID if payment belongs to an invoice. */
  invoice_id: string | null;

  /** Indicates whether this is an international payment. */
  international: boolean;

  /** Amount refunded in smallest currency unit. */
  amount_refunded: number;

  /** Refund status if refunded. */
  refund_status: string | null;

  /** Whether payment has been captured. */
  captured: boolean;

  /** Optional payment description. */
  description: string | null;

  /** Customer email address. */
  email: string;

  /** Customer phone number. */
  contact: string;

  /** Custom notes attached to payment. */
  notes: Record<string, string>;

  /** Razorpay processing fee. */
  fee: number;

  /** Tax charged on the fee. */
  tax: number;

  /** Error code when payment fails. */
  error_code: string | null;

  /** Human readable payment error. */
  error_description: string | null;

  /** Unix timestamp (seconds) when payment was created. */
  created_at: number;

  /** Wallet name if wallet payment (not used here). */
  wallet: string | null;
}

/**
 * Card payment.
 */
export interface RazorpayCardPayment extends RazorpayPaymentBase {
  /** Payment method. */
  method: RazorpayPaymentMethod.CARD;

  /** Card identifier. */
  card_id: string;

  /** Card details. */
  card: RazorpayCard;

  /** Not applicable for card payments. */
  bank: null;

  /** Not applicable for card payments. */
  vpa: null;
}

/**
 * Net Banking payment.
 */
export interface RazorpayNetBankingPayment extends RazorpayPaymentBase {
  /** Payment method. */
  method: RazorpayPaymentMethod.NETBANKING;

  /** No card associated. */
  card_id: null;

  /** No card details. */
  card?: never;

  /** Bank used for payment. */
  bank: string;

  /** Not applicable. */
  vpa: null;
}

/**
 * UPI payment.
 */
export interface RazorpayUpiPayment extends RazorpayPaymentBase {
  /** Payment method. */
  method: RazorpayPaymentMethod.UPI;

  /** No card associated. */
  card_id: null;

  /** No card details. */
  card?: never;

  /** Not applicable. */
  bank: null;

  /** Customer UPI Virtual Payment Address. */
  vpa: string;
}

/**
 * Card information.
 */
export interface RazorpayCard {
  /** Card identifier. */
  id: string;

  /** Always "card". */
  entity: RazorpayPaymentMethod.CARD;

  /** Card holder name. */
  name: string;

  /** Last four digits of the card. */
  last4: string;

  /** Card network. */
  network: string;

  /** Card type (debit/credit). */
  type: string;

  /** Card issuer if available. */
  issuer: string | null;

  /** Whether card is international. */
  international: boolean;

  /** Whether payment was EMI. */
  emi: boolean;
}

/**
 * Razorpay order details.
 */
export interface RazorpayOrder {
  /** Razorpay order identifier. */
  id: string;

  /** Always "order". */
  entity: 'order';

  /** Original order amount. */
  amount: number;

  /** Amount already paid. */
  amount_paid: number;

  /** Remaining unpaid amount. */
  amount_due: number;

  /** Currency code. */
  currency: string;

  /** Merchant receipt identifier. */
  receipt: string;

  /** Applied offer ID if any. */
  offer_id: string | null;

  /** Current order status. */
  status: string;

  /** Number of payment attempts. */
  attempts: number;

  /** Merchant supplied metadata. */
  notes: unknown[];

  /** Unix timestamp (seconds) when order was created. */
  created_at: number;
}
