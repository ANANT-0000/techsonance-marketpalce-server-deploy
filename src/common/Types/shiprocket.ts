export const ShiprocketStatus = {
  // Initial
  AWB_ASSIGNED: 1,
  LABEL_GENERATED: 2,
  PICKUP_SCHEDULED: 3,
  PICKUP_QUEUED: 4,
  MANIFEST_GENERATED: 5,

  // Forward Journey
  SHIPPED: 6,
  DELIVERED: 7,
  CANCELLED: 8,

  // RTO
  RTO_INITIATED: 9,
  RTO_DELIVERED: 10,

  // Operational
  PENDING: 11,

  OUT_FOR_DELIVERY: 17,
  IN_TRANSIT: 18,
  OUT_FOR_PICKUP: 19,
  PICKUP_EXCEPTION: 20,
  UNDELIVERED: 21,
  DELAYED: 22,
  PARTIAL_DELIVERED: 23,

  // Damage / Exception
  DESTROYED: 24,
  DAMAGED: 25,

  // Fulfillment
  FULFILLED: 26,

  PICKUP_BOOKED: 27,

  // Hub Events
  REACHED_DESTINATION_HUB: 38,
  MISROUTED: 39,

  // RTO Events
  RTO_NDR: 40,
  RTO_OFD: 41,
  PICKED_UP: 42,
  SELF_FULFILLED: 43,
  DISPOSED_OFF: 44,
  CANCELLED_BEFORE_DISPATCH: 45,
  RTO_IN_TRANSIT: 46,

  QC_FAILED: 47,
  REACHED_WAREHOUSE: 48,
} as const;
/**
 * Represents the date range and details for pickup or delivery suppression (e.g., festival delays).
 * Used to define periods where shipping operations are paused or delayed.
 */
interface SuppressionDates {
  /** ISO 8601 timestamp when the suppression action was recorded */
  action_on: string;
  /** Remark explaining the reason (e.g., "Festival") */
  delay_remark: string;
  /** Delay duration in seconds */
  delivery_delay_by: number;
  /** Delay duration in days (string format like "1") */
  delivery_delay_days: string;
  /** Start date of delivery delay (YYYY-MM-DD) */
  delivery_delay_from: string;
  /** End date of delivery delay (YYYY-MM-DD) */
  delivery_delay_to: string;
  /** Delay duration in seconds for pickup */
  pickup_delay_by: number;
  /** Delay duration in days for pickup */
  pickup_delay_days: string;
  /** Start date of pickup delay (YYYY-MM-DD) */
  pickup_delay_from: string;
  /** End date of pickup delay (YYYY-MM-DD) */
  pickup_delay_to: string;
}

/**
 * Represents a single courier company's availability, rates, and performance metrics.
 * Use Case: Displayed in the `available_courier_companies` list to help users select the best shipping option based on cost, speed, and reliability.
 */
interface CourierCompany {
  /** Maximum weight limit for air shipment (string like "0.00") */
  air_max_weight: string;
  /** Maximum insured amount allowed (0 if not applicable) */
  assured_amount: number;
  /** ID of the base courier (null if not set) */
  base_courier_id: number | null;
  /** Base weight threshold for billing (string) */
  base_weight: string;
  /** Blocked status: 0 = Available, 1 = Blocked */
  blocked: 0 | 1;
  /** Call before delivery status (e.g., "Available", "Not Available") */
  call_before_delivery: string;
  /** Chargeable weight factor */
  charge_weight: number;
  /** City name for the courier's service area */
  city: string;
  /** COD availability: 0 = No, 1 = Yes */
  cod: 0 | 1;
  /** Additional charges for COD services */
  cod_charges: number;
  /** Multiplier applied to COD amount */
  cod_multiplier: number;
  /** Base cost string (often empty if calculated dynamically) */
  cost: string;
  /** Unique ID for the courier company in Shiprocket */
  courier_company_id: number;
  /** Human-readable name of the courier (e.g., "Delhivery Surface") */
  courier_name: string;
  /** Courier type code (e.g., "0" for Surface) */
  courier_type: string;
  /** Coverage charges for the specific region */
  coverage_charges: number;
  /** Cutoff time for same-day pickup (e.g., "11:00") */
  cutoff_time: string;
  /** Delivery contact availability status */
  delivery_boy_contact: string;
  /** Delivery performance score (e.g., 4.5 or 5) */
  delivery_performance: number;
  /** Additional description or notes */
  description: string;
  /** Estimated Delivery Date (empty string if not calculated) */
  edd: string;
  /** Entry tax amount */
  entry_tax: number;
  /** Estimated number of delivery days (string like "4") */
  estimated_delivery_days: string;
  /** Expected Delivery Date (e.g., "Jul 01, 2024") */
  etd: string;
  /** Expected time in hours */
  etd_hours: number;
  /** Freight charge amount */
  freight_charge: number;
  /** Unique internal ID for this specific rate entry */
  id: number;
  /** Is this a custom rate? 0 = No, 1 = Yes */
  is_custom_rate: 0 | 1;
  /** Is hyperlocal delivery available? */
  is_hyperlocal: boolean;
  /** Is international delivery available? 0 = No, 1 = Yes */
  is_international: 0 | 1;
  /** Is RTO (Return to Origin) address available? */
  is_rto_address_available: boolean;
  /** Is surface transportation used? */
  is_surface: boolean;
  /** Is this a local region? 0 = No, 1 = Yes */
  local_region: number;
  /** Is this a metro city? 0 = No, 1 = Yes */
  metro: number;
  /** Minimum weight required for this courier */
  min_weight: number;
  /** Mode of transport (0 = Surface, 1 = Air, etc.) */
  mode: number;
  /** New EDD flag (0 = No update, 1 = Update) */
  new_edd: number;
  /** ODA Block status (boolean) */
  odablock: boolean;
  /** Other miscellaneous charges */
  other_charges: number;
  /** JSON string containing additional settings (e.g., allow_postcode_auto_sync) */
  others: string;
  /** Pickup availability status (e.g., "0") */
  pickup_availability: string;
  /** Pickup performance score */
  pickup_performance: number;
  /** Pickup priority level */
  pickup_priority: string;
  /** Pickup suppression hours */
  pickup_supress_hours: number;
  /** POD (Proof of Delivery) availability (e.g., "Instant", "On Request") */
  pod_available: string;
  /** Postal code for the service area */
  postcode: string;
  /** QC Courier flag: 0 = No, 1 = Yes */
  qc_courier: 0 | 1;
  /** Rank or sorting priority (empty string) */
  rank: string;
  /** Final calculated rate */
  rate: number;
  /** Overall rating score */
  rating: number;
  /** Real-time tracking availability status */
  realtime_tracking: string;
  /** Region code */
  region: number;
  /** RTO (Return to Origin) charges */
  rto_charges: number;
  /** RTO performance score */
  rto_performance: number;
  /** Seconds remaining before pickup cutoff */
  seconds_left_for_pickup: number;
  /** Is secure shipment disabled? */
  secure_shipment_disabled: boolean;
  /** Ship type code */
  ship_type: number;
  /** State name */
  state: string;
  /** Suppress date string */
  suppress_date: string;
  /** Suppress text message */
  suppress_text: string;
  /** Dates when pickup/delivery is suppressed (null if active) */
  suppression_dates: SuppressionDates | null;
  /** Maximum surface weight limit (string like "4.00") */
  surface_max_weight: string;
  /** Tracking performance score */
  tracking_performance: number;
  /** Maximum volumetric weight (null if not applicable) */
  volumetric_max_weight: number | null;
  /** Weight cases score */
  weight_cases: number;
  /** Zone code (e.g., "z_e") */
  zone: string;
}

/**
 * Represents a courier company that is blocked for a specific pincode.
 * Use Case: Used to filter out unavailable couriers from the selection list.
 */
interface BlockedCourierCompany {
  /** Reason for blocking (e.g., "Operational Issues") */
  block_reason: string;
  /** ID of the blocked courier company */
  courier_company_id: number;
  /** Name of the blocked courier */
  courier_name: string;
  /** Postal code where the block applies */
  postcode: string;
}

/**
 * Metadata about who or what recommended the courier.
 */
interface RecommendedBy {
  /** ID of the recommendation source */
  id: number;
  /** Title of the source (e.g., "Recommendation By Shiprocket") */
  title: string;
}

/**
 * Contains the core logic and data for courier selection, including recommendations and blocked couriers.
 * Use Case: This entire `data` object is used to render the "Select Courier" UI, calculate costs, and determine eligibility.
 */
interface Data {
  /** List of available couriers with full details */
  available_courier_companies: CourierCompany[];
  /** List of couriers blocked for the specific delivery address */
  blocked_courier_companies: BlockedCourierCompany[];
  /** Child courier ID (null if not applicable) */
  child_courier_id: number | null;
  /** Is recommendation engine enabled? 0 = No, 1 = Yes */
  is_recommendation_enabled: 0 | 1;
  /** Rule for advance recommendations */
  recommendation_advance_rule: 0 | 1;
  /** Details about the recommendation source */
  recommended_by: RecommendedBy;
  /** ID of the courier recommended by the system */
  recommended_courier_company_id: number;
  /** Internal ID for the Shiprocket recommended courier */
  shiprocket_recommended_courier_id: number;
}

/**
 * COVID-19 specific zone status for pickup and delivery.
 * Use Case: Used to flag if an area is under lockdown or special handling due to health crises.
 */
interface CovidZones {
  /** Delivery zone status: null if normal, string if restricted */
  delivery_zone: string | null;
  /** Pickup zone status: null if normal, string if restricted */
  pickup_zone: string | null;
}

/**
 * Main response interface for the courier rate and availability API.
 * Use Case: This is the top-level response you parse to display shipping options, check for blocked couriers, and apply insurance settings.
 */
export interface ShiprocketCourierServiceabilityResponse {
  /** Is auto-shipment insurance enabled for the account? */
  company_auto_shipment_insurance_setting: boolean;
  /** COVID-19 zone restrictions */
  covid_zones: CovidZones;
  /** Currency code for pricing (e.g., "INR") */
  currency: string;
  /** Detailed courier data and recommendations */
  data: Data;
  /** Is DG (Dangerous Goods) courier available? 0 = No, 1 = Yes */
  dg_courier: 0 | 1;
  /** Is the order eligible for insurance? */
  eligible_for_insurance: boolean;
  /** Was insurance opted at order creation? */
  insurace_opted_at_order_creation: boolean;
  /** Is templated pricing allowed? */
  is_allow_templatized_pricing: boolean;
  /** Is location data in LatLong format? 0 = No, 1 = Yes */
  is_latlong: 0 | 1;
  /** Is the old zone system opted? */
  is_old_zone_opted: boolean;
  /** Is zone data coming from MongoDB? */
  is_zone_from_mongo: boolean;
  /** Label generation type (integer code) */
  label_generate_type: number;
  /** New zone system status (integer code) */
  on_new_zone: number;
  /** Seller address configuration (array of objects) */
  seller_address: any[];
  /** HTTP Status code (200 = Success) */
  status: number;
  /** Is insurance mandatory for the user? */
  user_insurance_manadatory: boolean;
}
export /**
 * Represents the detailed timestamp object for pickup generation.
 * Use Case: Used to store precise creation times with timezone context for audit logs.
 */
interface PickupGeneratedDate {
  /** Full date and time string (e.g., "2021-12-10 12:39:54.034695") */
  date: string;
  /** Timezone type (3 indicates a named timezone like 'Asia/Kolkata') */
  timezone_type: number;
  /** Timezone identifier */
  timezone: string;
}

/**
 * Internal metadata parsed from the `others` JSON string.
 * Use Case: Contains granular timing breakdowns, routing codes, and system metadata used for logistics optimization and tracking.
 */
interface OthersMetadata {
  /** Tier ID for the courier service level */
  tier_id: number;
  /** Estimated Delivery Time (ETD) zone code */
  etd_zone: string;
  /** JSON string containing detailed time breakdowns (assign_to_pick, pick_to_ship, etc.) */
  etd_hours: string;
  /** Actual Estimated Delivery Date */
  actual_etd: string;
  /** Internal routing code for the courier network */
  routing_code: string;
  /** Array of reasons for ETD adjustments (e.g., "deduction_of_6_and_half_hours") */
  addition_in_etd: string[];
  /** Metadata about how the shipment was created */
  shipment_metadata: {
    /** Type of shipment */
    type: string;
    /** Browser engine used */
    device: string;
    /** Platform type */
    platform: string;
    /** Client IP address */
    client_ip: string;
    /** Creation timestamp */
    created_at: string;
    /** Request source type */
    request_type: string;
  };
  /** Flag for templatized pricing (0 = No, 1 = Yes) */
  templatized_pricing: 0 | 1;
  /** Courier selection strategy (e.g., "Best in price") */
  selected_courier_type: string;
  /** Data for the recommended courier */
  recommended_courier_data: {
    /** Estimated delivery date string */
    etd: string;
    /** Shipping price */
    price: number;
    /** Courier rating */
    rating: number;
    /** Courier ID */
    courier_id: number;
  } | null;
  /** Advanced recommendation rule (null if not used) */
  recommendation_advance_rule: number | null;
  /** Calculated dynamic weight of the package */
  dynamic_weight: string;
}

/**
 * The inner response object containing the pickup confirmation details.
 * Use Case: This is the core payload returned when a pickup request is successfully scheduled.
 */
interface PickupResponse {
  /** Scheduled date and time for pickup (e.g., "2021-12-10 12:39:54") */
  pickup_scheduled_date: string;
  /** Unique token number for the pickup reference */
  pickup_token_number: string;
  /** Status code of the pickup request (e.g., 3 = Confirmed) */
  status: number;
  /** JSON string containing detailed metadata (ETD, routing, courier selection) */
  others: string; // Should be parsed into OthersMetadata
  /** Timestamp object for when the pickup was generated */
  pickup_generated_date: PickupGeneratedDate;
  /** Human-readable confirmation message */
  data: string;
}

/**
 * Top-level interface for the pickup request response.
 * Use Case: Used to handle the API response after calling the "Request for Shipment Pickup" endpoint.
 */
export interface PickupRequestResponse {
  /** Status of the pickup request (1 = Success/Pending, 0 = Failed) */
  pickup_status: 0 | 1;
  /** Detailed object containing the pickup confirmation and metadata */
  response: PickupResponse;
}

/**
 * Shiprocket Create Order Payload
 * ? = Optional field
 * No ? = Required field (recommended to keep strict typing)
 */

export interface ShiprocketCreateOrderPayload {
  // ===== Order Information =====

  /** Unique order ID (max 50 chars) */
  order_id: string;

  /** Order creation date (YYYY-MM-DD HH:mm) */
  order_date: string;

  /** Existing pickup location name from Shiprocket */
  pickup_location: string;

  /** Assign order to a specific sales channel */
  channel_id?: number;

  /** Label comment (e.g. Reseller: Divine) */
  comment?: string;

  /** Vendor/Reseller name shown on label */
  reseller_name?: string;

  /** Company name */
  company_name?: string;

  // ===== Billing Details =====

  /** Customer first name */
  billing_customer_name: string;

  /** Customer last name */
  billing_last_name?: string;

  /** Billing address line 1 */
  billing_address: string;

  /** Billing address line 2 */
  billing_address_2?: string;

  /** Billing city */
  billing_city: string;

  /** Billing pincode */
  billing_pincode: number;

  /** Billing state */
  billing_state: string;

  /** Billing country */
  billing_country: string;

  /** Billing email */
  billing_email: string;

  /** Billing phone number */
  billing_phone: number;

  /** Alternate phone number */
  billing_alternate_phone?: number;

  /** Country ISD code (+91, +1, etc.) */
  billing_isd_code?: string;

  // ===== Shipping Details =====

  /**
   * true = Billing & Shipping same
   * false = Separate shipping address required
   */
  shipping_is_billing: boolean;

  /** Required when shipping_is_billing = false */
  shipping_customer_name?: string;

  /** Shipping customer last name */
  shipping_last_name?: string;

  /** Required when shipping_is_billing = false */
  shipping_address?: string;

  /** Additional shipping address */
  shipping_address_2?: string;

  /** Required when shipping_is_billing = false */
  shipping_city?: string;

  /** Required when shipping_is_billing = false */
  shipping_pincode?: number;

  /** Required when shipping_is_billing = false */
  shipping_state?: string;

  /** Required when shipping_is_billing = false */
  shipping_country?: string;

  /** Shipping email */
  shipping_email?: string;

  /** Required when shipping_is_billing = false */
  shipping_phone?: number;

  // ===== Geo Location =====

  /** Shipping destination longitude */
  longitude?: number;

  /** Shipping destination latitude */
  latitude?: number;

  // ===== Products =====

  /** Ordered items */
  order_items: ShiprocketOrderItem[];

  // ===== Payment =====

  /** COD or Prepaid */
  payment_method: 'COD' | 'Prepaid';

  /** Shipping charge */
  shipping_charges?: number;

  /** Gift wrap charge */
  giftwrap_charges?: number;

  /** Payment gateway charge */
  transaction_charges?: number;

  /** Total discount applied */
  total_discount?: number;

  /** Final order subtotal */
  sub_total: number;

  // ===== Package Dimensions =====

  /** Package length in CM (> 0.5) */
  length: number;

  /** Package breadth in CM (> 0.5) */
  breadth: number;

  /** Package height in CM (> 0.5) */
  height: number;

  /** Package weight in KG (> 0) */
  weight: number;

  // ===== Tax & Invoice =====

  /** GSTIN Number */
  customer_gstin?: string;

  /** Invoice Number */
  invoice_number?: string;

  // ===== Advanced Options =====

  /**
   * ESSENTIALS | NON ESSENTIALS
   */
  order_type?: 'ESSENTIALS' | 'NON ESSENTIALS';

  /**
   * Delivery Speed Preference
   * SR_RUSH = Same/Next Day
   * SR_STANDARD = Surface
   * SR_EXPRESS = Air
   * SR_QUICK = 3 Hour Delivery
   */
  checkout_shipping_method?:
    | 'SR_RUSH'
    | 'SR_STANDARD'
    | 'SR_EXPRESS'
    | 'SR_QUICK';

  /** What3Words address */
  what3words_address?: string;

  /** Shipment insurance */
  is_insurance_opt?: boolean;

  /** 1 = Document shipment, 0 = Product shipment */
  is_document?: 0 | 1;

  /** Custom tags */
  order_tag?: string;
}

/**
 * Single Order Item
 */
export interface ShiprocketOrderItem {
  /** Product name */
  name: string;

  /** Product SKU */
  sku: string;

  /** Quantity */
  units: number;

  /** Price per unit (GST included) */
  selling_price: number;

  /** Discount amount */
  discount?: number;

  /** Tax percentage */
  tax?: number;

  /** HSN code */
  hsn?: number;
}
export interface ShiprocketCreateOrderResponse {
  order_id: number;
  shipment_id: number;
  status: string;
  status_code: number;
}
/**
 * Shiprocket Order Details Response
 */
export interface ShiprocketOrderResponse {
  data: ShiprocketOrder;
}

export interface ShiprocketOrder {
  // ===== Order =====

  id: number;
  channel_id: number;
  channel_name: string;
  channel_order_id: string;

  order_date: string;
  created_at: string;
  updated_at: string;

  status: string;
  sub_status?: string | null;
  status_code: number;

  payment_method: string;
  payment_status?: string;

  currency: string;

  total: number;
  net_total: string;

  cod: number;
  discount: number;
  tax: number;

  // ===== Customer =====

  customer_name: string;
  customer_email: string;
  customer_phone: string;

  customer_address: string;
  customer_address_2?: string | null;

  customer_city: string;
  customer_state: string;
  customer_pincode: string;
  customer_country: string;

  // ===== Pickup =====

  pickup_location?: string;
  pickup_location_id?: string;
  pickup_id?: string;

  // ===== Billing =====

  billing_name?: string;
  billing_email?: string;
  billing_phone?: string;
  billing_address?: string;
  billing_address_2?: string;
  billing_city?: string;
  billing_state_name?: string;
  billing_country_name?: string;
  billing_pincode?: string;

  billing_mobile_country_code?: string;
  billing_isd_code?: string;

  // ===== Shipping =====

  shipping_is_billing: number;

  // ===== Package =====

  shipping_charges?: string;
  giftwrap_charges: string;

  weight?: string;
  quantity?: number;
  dimensions?: string;

  // ===== Product List =====

  products: ShiprocketProduct[];

  // ===== Shipment =====

  shipments: ShiprocketShipment;

  // ===== AWB =====

  awb_data: ShiprocketAwbData;

  // ===== Insurance =====

  order_insurance: ShiprocketInsurance;

  // ===== Return Pickup =====

  return_pickup_data?: ShiprocketReturnPickup;

  // ===== Additional =====

  company_name?: string;
  reseller_name?: string;

  order_tag?: string;

  is_return: number;
  is_document: number;
  is_international: number;

  extra_info?: ShiprocketExtraInfo;

  others?: ShiprocketOthers;
}

export interface ShiprocketProduct {
  id: number;

  product_id: number;
  order_id: number;

  name: string;
  sku: string;

  description?: string;

  hsn?: string;

  brand?: string;
  color?: string;
  size?: string | null;

  weight: number;

  dimensions: string;

  price: number;
  cost: number;
  mrp: number;

  quantity: number;

  tax: number;
  discount: number;

  net_total: number;
  selling_price: number;

  tax_percentage: number;

  channel_category?: string;
}

export interface ShiprocketShipment {
  id: number;

  order_id: number;

  awb?: string | null;

  courier?: string;
  courier_id?: string;

  status: string;

  quantity: number;

  weight: number;
  volumetric_weight: number;

  dimensions: string;

  length: number;
  breadth: number;
  height: number;

  created_at: string;
  updated_at: string;

  is_rto: boolean;
  is_single_shipment: boolean;

  eway_required: boolean;
}

export interface ShiprocketAwbData {
  awb?: string;

  applied_weight?: string;
  charged_weight?: string;
  billed_weight?: string;

  routing_code?: string;

  charges: {
    zone?: string;

    freight_charges?: string;
    cod_charges?: string;

    applied_weight?: string;
    charged_weight?: string;

    applied_weight_amount?: string;
    charged_weight_amount?: string;
  };
}

export interface ShiprocketInsurance {
  insurance_status: string;
  policy_no: string;
  claim_enable: boolean;
}

export interface ShiprocketReturnPickup {
  id: number;

  name: string;
  email: string;
  phone: string;

  address: string;
  address_2?: string;

  city: string;
  state: string;
  country: string;

  pin_code: string;

  lat?: number | null;
  long?: number | null;

  order_id: number;

  created_at: string;
  updated_at: string;
}

export interface ShiprocketOthers {
  weight: string;
  quantity: number;

  dimensions: string;

  shipping_name: string;
  shipping_email: string;
  shipping_phone: string;

  shipping_address: string;
  shipping_address_2?: string;

  shipping_city: string;
  shipping_state: string;
  shipping_country: string;
  shipping_pincode: string;

  shipping_charges: string;

  company_name?: string;
  billing_isd_code?: string;
}

export interface ShiprocketExtraInfo {
  qc_check: number;

  qc_params: string;

  order_type: number;

  amazon_dg_status: boolean;
  bluedart_dg_status: boolean;
  other_courier_dg_status: boolean;

  insurace_opted_at_order_creation: boolean;
}

/**
 * Shiprocket Reverse Pickup / Return Order Payload
 */
export interface ShiprocketReturnOrderPayload {
  // ===== Order =====

  /** Unique order id */
  order_id: string;

  /** Order date (YYYY-MM-DD) */
  order_date: string;

  /** Sales channel */
  channel_id?: number;

  // ===== Pickup Customer (Buyer) =====

  /** Customer first name */
  pickup_customer_name: string;

  /** Customer last name */
  pickup_last_name?: string;

  /** Pickup address */
  pickup_address: string;

  /** Additional address */
  pickup_address_2?: string;

  /** Pickup city */
  pickup_city: string;

  /** Pickup state */
  pickup_state: string;

  /** Pickup country */
  pickup_country: string;

  /** Pickup pincode */
  pickup_pincode: number;

  /** Customer email */
  pickup_email: string;

  /** Customer phone */
  pickup_phone: string;

  /** Country code */
  pickup_isd_code?: string;

  // ===== Return Destination (Seller) =====

  /** Seller name */
  shipping_customer_name: string;

  /** Seller last name */
  shipping_last_name?: string;

  /** Return destination address */
  shipping_address: string;

  /** Additional address */
  shipping_address_2?: string;

  /** Return destination city */
  shipping_city: string;

  /** Return destination country */
  shipping_country: string;

  /** Return destination pincode */
  shipping_pincode: number;

  /** Return destination state */
  shipping_state: string;

  /** Seller email */
  shipping_email?: string;

  /** Country code */
  shipping_isd_code?: string;

  /** Seller phone */
  shipping_phone: number;

  // ===== Products =====

  /** Return items */
  order_items: ShiprocketReturnOrderItem[];

  // ===== Payment =====

  /** Always Prepaid */
  payment_method: 'Prepaid';

  /** Order discount */
  total_discount?: string;

  /** Final subtotal */
  sub_total: number;

  // ===== Package =====

  /** Length in cm */
  length: number;

  /** Breadth in cm */
  breadth: number;

  /** Height in cm */
  height: number;

  /** Weight in kg */
  weight: number;
}

/**
 * Single Return Item
 */
export interface ShiprocketReturnOrderItem {
  /** Product name */
  name: string;

  /** Product SKU */
  sku: string;

  /** Quantity */
  units: number;

  /** Unit selling price */
  selling_price: number;

  /** Discount amount */
  discount?: number;

  /** HSN code */
  hsn?: string;

  /** Return reason */
  return_reason?: string;

  /**
   * Enable QC
   * If true, qc_product_name &
   * qc_product_image become required
   */
  qc_enable?: boolean;

  /** Product color */
  qc_color?: string;

  /** Product brand */
  qc_brand?: string;

  /** Serial number */
  qc_serial_no?: string;

  /** Barcode/EAN */
  qc_ean_barcode?: string;

  /** Product size */
  qc_size?: string;

  /**
   * Required when qc_enable=true
   */
  qc_product_name?: string;

  /**
   * Required when qc_enable=true
   */
  qc_product_image?: string;

  /** Device IMEI */
  qc_product_imei?: string;

  /** Verify brand tag */
  qc_brand_tag?: boolean;

  /** Verify product usage */
  qc_used_check?: boolean;

  /** Verify seal tag */
  qc_sealtag_check?: boolean;

  /** Damage check */
  qc_check_damaged_product?: 'yes' | 'no';
}

export interface ShiprocketReturnOrderResponse {
  order_id: number;
  shipment_id: number;
  status: 'RETURN PENDING';
  status_code: number;
  company_name: string;
}

/**
 * Shiprocket Exchange Order Payload
 */
export interface ShiprocketExchangeOrderPayload {
  // ===== Order =====

  /** Exchange order ID */
  exchange_order_id: string;

  /** Seller pickup location ID */
  seller_pickup_location_id: string;

  /** Seller shipping location ID */
  seller_shipping_location_id: string;

  /** Return order ID */
  return_order_id: string;

  /** Order date (YYYY-MM-DD) */
  order_date: string;

  /** Payment method */
  payment_method: ShiprocketPaymentMethod;

  // ===== Buyer Shipping =====

  /** Shipping first name */
  buyer_shipping_first_name: string;

  /** Shipping last name */
  buyer_shipping_last_name?: string;

  /** Shipping email */
  buyer_shipping_email?: string;

  /** Shipping address */
  buyer_shipping_address: string;

  /** Additional address */
  buyer_shipping_address_2?: string;

  /** Shipping city */
  buyer_shipping_city: string;

  /** Shipping state */
  buyer_shipping_state: string;

  /** Shipping country */
  buyer_shipping_country: string;

  /** Shipping pincode */
  buyer_shipping_pincode: string;

  /** Shipping phone */
  buyer_shipping_phone: string;

  // ===== Buyer Pickup =====

  /** Pickup first name */
  buyer_pickup_first_name: string;

  /** Pickup last name */
  buyer_pickup_last_name?: string;

  /** Pickup email */
  buyer_pickup_email?: string;

  /** Pickup address */
  buyer_pickup_address: string;

  /** Additional address */
  buyer_pickup_address_2?: string;

  /** Pickup city */
  buyer_pickup_city: string;

  /** Pickup state */
  buyer_pickup_state: string;

  /** Pickup country */
  buyer_pickup_country: string;

  /** Pickup pincode */
  buyer_pickup_pincode: string;

  /** Pickup phone */
  buyer_pickup_phone: string;

  // ===== Products =====

  /** Exchange items */
  order_items: ShiprocketExchangeOrderItem[];

  // ===== Pricing =====

  /** Order subtotal */
  sub_total: number;

  /** Shipping charges */
  shipping_charges?: number;

  /** Gift wrap charges */
  giftwrap_charges?: number;

  /** Total discount */
  total_discount?: number;

  /** Transaction charges */
  transaction_charges?: number;

  // ===== Return Package =====

  /** Return package length */
  return_length: number;

  /** Return package breadth */
  return_breadth: number;

  /** Return package height */
  return_height: number;

  /** Return package weight */
  return_weight: number;

  // ===== Exchange Package =====

  /** Exchange package length */
  exchange_length: number;

  /** Exchange package breadth */
  exchange_breadth: number;

  /** Exchange package height */
  exchange_height: number;

  /** Exchange package weight */
  exchange_weight: number;

  /** Return reason code */
  return_reason: string;
}

/**
 * Exchange Item
 */
export interface ShiprocketExchangeOrderItem {
  /** Product name */
  name: string;

  /** Product price */
  selling_price: number;

  /** Quantity */
  units: number;

  /** HSN code */
  hsn: string;

  /** Product SKU */
  sku: string;

  /** Tax amount */
  tax?: number;

  /** Discount amount */
  discount?: number;

  /** Exchange item ID */
  exchange_item_id?: string;

  /** Exchange item name */
  exchange_item_name: string;

  /** Exchange item SKU */
  exchange_item_sku: string;
}
export enum ShiprocketPaymentMethod {
  PREPAID = 'prepaid',
  COD = 'cod',
}
export interface ShiprocketExchangeOrderResponse {
  success: true;
  data: {
    forward_orders: {
      order_id: number;
      channel_order_id: string;
      shipment_id: number;
      status: 'NEW';
      status_code: 1;
      awb_code: '';
      courier_company_id: '';
      courier_name: '';
    };
    return_orders: {
      order_id: number;
      channel_order_id: string;
      shipment_id: number;
      status: 'RETURN PENDING';
      status_code: number;
      awb_code: string;
      courier_company_id: string;
      courier_name: string;
    };
  };
}
