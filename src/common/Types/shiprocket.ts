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
 * Request payload for the ShipRocket Check Serviceability API.
 */
export interface ShipRocketCheckServiceabilityRequest {
  /**
   * Pickup location postcode (PIN code).
   *
   * Required.
   *
   * Example: 110030
   */
  pickup_postcode: number;

  /**
   * Delivery destination postcode (PIN code).
   *
   * Required.
   *
   * Example: 122002
   */
  delivery_postcode: number;

  /**
   * Existing ShipRocket Order ID.
   *
   * Optional.
   * If the order has already been created in the ShipRocket panel,
   * this ID can be used instead of shipment details.
   *
   * Example: 123456
   */
  order_id?: number;

  /**
   * Cash on Delivery (COD) status.
   *
   * Conditionally required when order_id is not provided.
   *
   * - 1 = Cash on Delivery
   * - 0 = Prepaid
   *
   * Example: 1
   */
  cod?: 0 | 1;

  /**
   * Total shipment weight in kilograms.
   *
   * Conditionally required when order_id is not provided.
   *
   * Example: "2"
   */
  weight: string;

  /**
   * Shipment length in centimeters.
   *
   * Optional.
   *
   * Example: 15
   */
  length?: number;

  /**
   * Shipment breadth (width) in centimeters.
   *
   * Optional.
   *
   * Example: 10
   */
  breadth?: number;

  /**
   * Shipment height in centimeters.
   *
   * Optional.
   *
   * Example: 5
   */
  height?: number;

  /**
   * Declared shipment value in INR.
   *
   * Optional.
   * Required when `is_return` is set to 1.
   *
   * Example: 50
   */
  declared_value?: number;

  /**
   * Preferred transportation mode.
   *
   * Optional.
   *
   * Allowed values:
   * - "Air"
   * - "Surface"
   *
   * Example: "Air"
   */
  mode?: 'Air' | 'Surface';

  /**
   * Whether the shipment is a return shipment.
   *
   * Optional.
   *
   * - 1 = Return shipment
   * - 0 = Forward shipment
   *
   * Note:
   * If set to 1, `declared_value` becomes mandatory.
   *
   * Example: 0
   */
  is_return?: 0 | 1;

  /**
   * Filter to show only document couriers.
   *
   * Optional.
   *
   * Accepted value:
   * - 1 = Enable document-only couriers
   *
   * Example: 1
   */
  couriers_type?: 1;

  /**
   * Filter to show only hyperlocal couriers.
   *
   * Optional.
   *
   * Accepted value:
   * - 1 = Enable hyperlocal couriers
   *
   * Example: 1
   */
  only_local?: 1;

  /**
   * Filter to show only QC-enabled couriers.
   *
   * Conditionally required when `is_return` is 1.
   *
   * Accepted value:
   * - 1 = QC-enabled couriers only
   *
   * Example: 1
   */
  qc_check?: 1;
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
export interface ShiprocketPickupRequestResponse {
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

  /** Billing pincode (string to preserve leading zeros, e.g. 011001) */
  billing_pincode: number | string;

  /** Billing state */
  billing_state: string;

  /** Billing country */
  billing_country: string;

  /** Billing email */
  billing_email: string;

  /** Billing phone number (string to preserve international formatting) */
  billing_phone: number | string;

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
  shipping_pincode?: number | string;

  /** Required when shipping_is_billing = false */
  shipping_state?: string;

  /** Required when shipping_is_billing = false */
  shipping_country?: string;

  /** Shipping email */
  shipping_email?: string;

  /** Required when shipping_is_billing = false */
  shipping_phone?: number | string;

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
  onboarding_completed_now: 0 | 1;
  awb_code: string | null;
  courier_company_id: string | null;
  courier_name: string | null;
}
export interface ShipRocketCancelShipmentRequest {
  ids: number[];
  status?: string;
}
export interface ShipRocketCancelShipmentResponse {
  shipment_id: number | number[];
  status?: string;
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
/**
 * Represents the date and time information with timezone details.
 * Commonly used in Shiprocket API responses for timestamps.
 */
export interface DateTimeInfo {
  /** The date and time in 'YYYY-MM-DD HH:mm:ss.ssssss' format. */
  date: string;
  /** The type of timezone (e.g., 3 for fixed offset). */
  timezone_type: number;
  /** The IANA timezone identifier (e.g., 'Asia/Kolkata'). */
  timezone: string;
}

/**
 * Represents the shipper and RTO (Return to Origin) details.
 * Contains both the pickup (shipper) and delivery (customer) address information.
 */
export interface ShippedByDetails {
  /** Name of the shipper or store. */
  shipper_company_name: string;
  /** First line of the shipper's address. */
  shipper_address_1: string;
  /** Second line of the shipper's address (optional). */
  shipper_address_2: string;
  /** City of the shipper. */
  shipper_city: string;
  /** State of the shipper. */
  shipper_state: string;
  /** Country of the shipper. */
  shipper_country: string;
  /** Postal code of the shipper. */
  shipper_postcode: string;
  /** 1 if first-mile activation is enabled, 0 otherwise. */
  shipper_first_mile_activated: 0 | 1;
  /** Phone number of the shipper. */
  shipper_phone: string;
  /** Latitude coordinate for the shipper's location. */
  lat: string;
  /** Longitude coordinate for the shipper's location. */
  long: string;
  /** Email address of the shipper. */
  shipper_email: string;
  /** Name of the courier handling RTO (Return to Origin). */
  rto_company_name: string;
  /** First line of the RTO address. */
  rto_address_1: string;
  /** Second line of the RTO address (optional). */
  rto_address_2: string;
  /** City of the RTO destination. */
  rto_city: string;
  /** State of the RTO destination. */
  rto_state: string;
  /** Country of the RTO destination. */
  rto_country: string;
  /** Postal code of the RTO destination. */
  rto_postcode: string;
  /** Phone number for the RTO contact. */
  rto_phone: string;
  /** Email for the RTO contact. */
  rto_email: string;
}

/**
 * Represents the core shipment data returned after assigning an AWB.
 * Includes courier details, order IDs, and shipping metadata.
 */
export interface AWBAssignData {
  /** Unique ID of the courier company. */
  courier_company_id: number;
  /** The Air Waybill (AWB) number assigned to the shipment. */
  awb_code: string;
  /** Cash on Delivery amount. 0 if no COD. */
  cod: number;
  /** The internal Shiprocket Order ID. */
  order_id: number;
  /** The internal Shiprocket Shipment ID. */
  shipment_id: number;
  /** Status of the AWB code assignment (1 for active/assigned). */
  awb_code_status: number;
  /** Timestamp when the AWB was assigned. */
  assigned_date_time: DateTimeInfo;
  /** Weight applied for shipping calculations (in kg). */
  applied_weight: number;
  /** Internal company ID associated with the shipment. */
  company_id: number;
  /** Name of the assigned courier service. */
  courier_name: string;
  /** Name of the specific child courier service (if applicable). */
  child_courier_name: string | null;
  /** Scheduled date and time for pickup. */
  pickup_scheduled_date: string;
  /** Routing code for the shipment (optional). */
  routing_code: string;
  /** Routing code specifically for RTO (optional). */
  rto_routing_code: string;
  /** Invoice number associated with the shipment. */
  invoice_no: string;
  /** Transporter ID (optional). */
  transporter_id: string;
  /** Transporter name (optional). */
  transporter_name: string;
  /** Detailed object containing shipper and RTO address information. */
  shipped_by: ShippedByDetails;
}
export interface ShiprocketGenerateAWBforShipment {
  /**
   * Shipment ID for which the AWB needs to be generated.
   *
   * Required.
   *
   * Example: 16016920
   */
  shipment_id: number;

  /**
   * Courier company ID to assign for the shipment.
   *
   * Optional.
   * If omitted, ShipRocket automatically assigns the default/recommended courier.
   *
   * Example: 10
   */
  courier_id?: number;

  /**
   * Reassign the courier for an existing shipment.
   *
   * Optional.
   * Use this only when changing the assigned courier.
   *
   * Allowed value:
   * - "reassign"
   *
   * Note:
   * Courier reassignment is allowed only once within a 24-hour period.
   *
   * Example: "reassign"
   */
  status?: '' | 'reassign';
}
/**
 * The root response object for the Shiprocket "Generate AWB" API.
 * Indicates the success status and contains the shipment data.
 */
export interface ShiprocketGenerateAWBforShipmentResponse {
  /**
   * Status of the AWB assignment request.
   * 1 typically indicates success, 0 indicates failure.
   */
  awb_assign_status: number;
  /** The payload containing the shipment details. */
  response: {
    data: AWBAssignData;
  };
}
/**
 * Represents a single tracking scan event in the shipment's journey.
 */
export interface ShipmentScan {
  /** Timestamp of the scan event (format: YYYY-MM-DD HH:MM:SS). */
  date: string;

  /** Internal status code (e.g., 'X-UCI', 'X-PPOM'). */
  status: string;

  /** Human-readable description of the activity. */
  activity: string;

  /** Location where the scan occurred. */
  location: string;

  /** Shiprocket internal status ID code (e.g., '5', '18', 'NA'). */
  'sr-status'?: string;

  /** Human-readable Shiprocket status label (e.g., 'MANIFEST GENERATED'). */
  'sr-status-label'?: string;
}

/**
 * Represents the complete tracking response object from Shiprocket.
 */
export interface ShiprocketWebhookBody {
  /** Air Waybill number assigned by the courier. */
  awb: string;

  /** Name of the courier service (e.g., 'Delhivery Surface'). */
  courier_name: string;

  /** Current high-level status string (e.g., 'IN TRANSIT'). */
  current_status: string;

  /** Numeric ID for the current status. */
  current_status_id: number;

  /** Alias for current_status. */
  shipment_status: string;

  /** Alias for current_status_id. */
  shipment_status_id: number;

  /** Latest update timestamp (format: DD MM YYYY HH:MM:SS). */
  current_timestamp: string;

  /** Merchant's reference order ID. */
  order_id: string;

  /** Unique Shiprocket Order ID. */
  sr_order_id: number;

  /** Date AWB was assigned (YYYY-MM-DD HH:MM:SS). */
  awb_assigned_date: string;

  /** Date pickup was scheduled (YYYY-MM-DD HH:MM:SS). */
  pickup_scheduled_date: string;

  /** Estimated Time of Departure/Arrival (YYYY-MM-DD HH:MM:SS). */
  etd: string;

  /** Chronological array of all scan events. */
  scans: ShipmentScan[];

  /** Flag indicating if the shipment is a return (1) or new (0). */
  is_return: 0 | 1;

  /** ID of the sales channel used. */
  channel_id: number;

  /** Proof of Delivery status type (e.g., 'OTP Based Delivery'). */
  pod_status: string;

  /** Proof of Delivery content (e.g., signature image URL or 'Not Available'). */
  pod: string;

  /** Quality Check image URL (if applicable). */
  qc_image: string;

  /** Reason for QC failure (if applicable). */
  qc_failure_reason: string;
}

export interface ShiprocketAddPickupAddress {
  /** Nickname of the pickup location (max 36 chars) */
  pickup_location: string;

  /** Shipper name */
  name: string;

  /** Shipper email address */
  email: string;

  /** Shipper phone number */
  phone: number | string;

  /** Primary address (max 80 chars) */
  address: string;

  /** Additional address details */
  address_2?: string;

  /** City name */
  city: string;

  /** State name */
  state: string;

  /** Country name */
  country: string;

  /** Postal/PIN code */
  pin_code: number | string;

  /** Latitude */
  lat?: number | string;

  /** Longitude */
  long?: number | string;

  /** Address type (e.g. vendor) */
  address_type?: string;

  /** Vendor name (required when address_type = 'vendor') */
  vendor_name?: string;

  /** GSTIN number */
  gstin?: string;
}
export interface ShiprocketAddPickupAddressResponse {
  success: boolean;
  address: {
    company_id: number;
    pickup_code: string;
    address: string;
    address_2: string;
    address_type: string | null;
    city: string;
    state: string;
    country: string;
    gstin: string | null;
    pin_code: string;
    phone: string;
    email: string;
    name: string;
    alternate_phone: string | null;
    lat: number | null;
    long: number | null;
    status: number;
    phone_verified: number;
    rto_address_id: number;
    extra_info: string;
    updated_at: string;
    created_at: string;
    id: number;
  };
  pickup_id: number;
  company_name: string;
  full_name: string;
}
export interface ShipRocketRequestForShipmentPickup {
  /** Shipment IDs for which pickup needs to be scheduled */
  shipment_id: number[];
  /** Use this field to retry if the pickup request fails. Value: retry */
  status?: string;
  /** Pickup dates for the shipments */
  pickup_date?: string[];
}

/**
 * Response returned by the
 * Request for Shipment Pickup API.
 */
export interface ShipRocketRequestForShipmentPickupResponse {
  pickup_status: number;
  response: ShipRocketRequestForShipmentPickupResponseData;
}

/**
 * Response returned by the ShipRocket Request for Shipment Pickup API.
 */
export interface ShipRocketRequestForShipmentPickupResponse {
  pickup_status: number;
  response: ShipRocketRequestForShipmentPickupResponseData;
}

/**
 * Main response payload.
 */
export interface ShipRocketRequestForShipmentPickupResponseData {
  /**
   * Scheduled pickup date & time.
   * Format: YYYY-MM-DD HH:mm:ss
   */
  pickup_scheduled_date: string;

  /**
   * Pickup reference/token number.
   */
  pickup_token_number: string;

  /**
   * Pickup status code.
   */
  status: number;

  /**
   * JSON string.
   * Parse into ShipRocketRequestForShipmentPickupParsedOthers.
   */
  others: ShipRocketRequestForShipmentPickupParsedOthers;

  /**
   * Pickup generation timestamp.
   */
  pickup_generated_date: ShipRocketRequestForShipmentPickupGeneratedDate;

  /**
   * Human-readable pickup confirmation message.
   */
  data: string;
}

/**
 * Pickup generation timestamp.
 */
export interface ShipRocketRequestForShipmentPickupGeneratedDate {
  date: string;
  timezone_type: number;
  timezone: string;
}

/**
 * Parsed value of response.others.
 */
export interface ShipRocketRequestForShipmentPickupParsedOthers {
  tier_id: number;

  etd_zone: string;

  /**
   * JSON string.
   * Parse into ShipRocketRequestForShipmentPickupParsedEtdHours.
   */
  etd_hours: string;

  actual_etd: string;

  routing_code: string;

  addition_in_etd: string[];

  shipment_metadata: ShipRocketRequestForShipmentPickupShipmentMetadata;

  templatized_pricing: number;

  selected_courier_type: string;

  recommended_courier_data: ShipRocketRequestForShipmentPickupRecommendedCourier;

  recommendation_advance_rule: null;

  dynamic_weight: string;
}

/**
 * Parsed value of parsedOthers.etd_hours.
 */
export interface ShipRocketRequestForShipmentPickupParsedEtdHours {
  assign_to_pick: number;

  pick_to_ship: number;

  ship_to_deliver: number;

  etd_zone: string;

  pick_to_ship_table: string;

  ship_to_deliver_table: string;
}

/**
 * Shipment metadata.
 */
export interface ShipRocketRequestForShipmentPickupShipmentMetadata {
  type: string;

  device: string;

  platform: string;

  client_ip: string;

  created_at: string;

  request_type: string;
}

/**
 * Recommended courier details.
 */
export interface ShipRocketRequestForShipmentPickupRecommendedCourier {
  etd: string;

  price: number;

  rating: number;

  courier_id: number;
}
/**
 * Request payload for the ShipRocket Update NDR (Non-Delivery Report) API.
 */
export interface ShiprocketNDRAction {
  /**
   * Action to be performed for the NDR.
   *
   * Required.
   *
   * Allowed values:
   * - "fake-attempt"
   * - "re-attempt"
   * - "return"
   *
   * Example: "re-attempt"
   */
  action: 'fake-attempt' | 're-attempt' | 'return';

  /**
   * Comment describing the requested action.
   *
   * Required.
   *
   * Example:
   * "Buyer does not want the product."
   */
  comments: string;

  /**
   * Updated customer phone number.
   *
   * Optional.
   * Used only for:
   * - "fake-attempt"
   * - "re-attempt"
   *
   * Example:
   * "9999988888"
   */
  phone?: string;

  /**
   * Public URL of the delivery proof audio.
   *
   * Conditionally required when action is "fake-attempt".
   *
   * Example:
   * https://example.com/audio.mp3
   */
  proof_audio?: string;

  /**
   * Public URL of the delivery proof image.
   *
   * Conditionally required when action is "fake-attempt".
   *
   * Example:
   * https://example.com/image.jpg
   */
  proof_image?: string;

  /**
   * Remarks explaining the fake delivery attempt.
   *
   * Conditionally required when action is "fake-attempt".
   *
   * Example:
   * "Delivery Requested"
   */
  remarks?: string;

  /**
   * Updated customer address line 1.
   *
   * Optional.
   * Used only for:
   * - "fake-attempt"
   * - "re-attempt"
   *
   * Example:
   * "U-56, Sector-23"
   */
  address1?: string;

  /**
   * Updated customer address line 2.
   *
   * Optional.
   * Used only for:
   * - "fake-attempt"
   * - "re-attempt"
   *
   * Example:
   * "Noida, Uttar Pradesh"
   */
  address2?: string;

  /**
   * Preferred delivery date.
   *
   * Optional.
   * Used only for:
   * - "fake-attempt"
   * - "re-attempt"
   *
   * Format: YYYY-MM-DD
   *
   * Example:
   * "2022-08-10"
   */
  deferred_date?: string;
}
/**
 * Response payload for the ShipRocket Update NDR (Non-Delivery Report) API.
 */
export interface ShiprocketNDRActionResponse {
  status: string;
}

/**
 * Request payload for the ShipRocket Update Return Order API.
 */
export interface ShipRocketUpdateReturnOrderRequest {
  /**
   * Your ShipRocket return order ID.
   *
   * Required.
   *
   * Example:
   * "R_1231234"
   */
  order_id: string;

  /**
   * Actions to perform on the return order.
   *
   * Required.
   *
   * Allowed values:
   * - "product_details"   → Update shipment weight and dimensions.
   * - "warehouse_address" → Update the return warehouse address.
   *
   * One or both actions can be supplied.
   *
   * Example:
   * ["product_details"]
   * ["warehouse_address"]
   * ["product_details", "warehouse_address"]
   */
  action: ShipRocketUpdateReturnOrderAction[];

  /**
   * Updated shipment length in centimeters.
   *
   * Conditionally required when
   * "product_details" is included in `action`.
   *
   * Must be greater than 0.5.
   *
   * Example:
   * 12
   */
  length?: number;

  /**
   * Updated shipment breadth (width) in centimeters.
   *
   * Conditionally required when
   * "product_details" is included in `action`.
   *
   * Must be greater than 0.5.
   *
   * Example:
   * 23
   */
  breadth?: number;

  /**
   * Updated shipment height in centimeters.
   *
   * Conditionally required when
   * "product_details" is included in `action`.
   *
   * Must be greater than 0.5.
   *
   * Example:
   * 30
   */
  height?: number;

  /**
   * Updated shipment weight in kilograms.
   *
   * Conditionally required when
   * "product_details" is included in `action`.
   *
   * Must be greater than 0.
   *
   * Example:
   * 10
   */
  weight?: number;

  /**
   * Return warehouse (pickup location) ID.
   *
   * Conditionally required when
   * "warehouse_address" is included in `action`.
   *
   * Example:
   * 213443
   */
  return_warehouse_id?: number;
}

/**
 * Supported update actions for the
 * ShipRocket Update Return Order API.
 */
export type ShipRocketUpdateReturnOrderAction =
  | 'product_details'
  | 'warehouse_address';
/**
 * Response returned by the ShipRocket Update Return Order API.
 */
export interface ShipRocketUpdateReturnOrderResponse {
  /**
   * Result of updating the product details.
   */
  product_details: ShipRocketUpdateReturnOrderOperationResult;

  /**
   * Result of updating the return warehouse address.
   */
  return_warehouse_address: ShipRocketUpdateReturnOrderOperationResult;
}

/**
 * Response for an individual update operation.
 */
export interface ShipRocketUpdateReturnOrderOperationResult {
  /**
   * Indicates whether the update operation succeeded.
   */
  success: boolean;

  /**
   * Human-readable status message.
   *
   * Examples:
   * - "Product Details is updated successfully"
   * - "Shipping Address is updated successfully"
   */
  msg: string;
}
/**
 * Request payload for the ShipRocket Create Exchange Order API.
 */
export interface ShipRocketCreateExchangeOrderRequest {
  /**
   * Unique exchange order ID.
   * Example: EX_TEST002
   */
  exchange_order_id: string;

  /**
   * Seller pickup location ID.
   */
  seller_pickup_location_id: string;

  /**
   * Seller shipping location ID.
   */
  seller_shipping_location_id: string;

  /**
   * Associated return order ID.
   * Example: R_TEST002
   */
  return_order_id: string;

  /**
   * Order placement date.
   * Format: YYYY-MM-DD
   */
  order_date: string;

  /**
   * Payment method.
   * Example: "prepaid"
   */
  payment_method: string;

  /**
   * Shipping address details.
   */
  buyer_shipping: ShipRocketExchangeOrderBuyerShippingDetails;

  /**
   * Pickup address details.
   */
  buyer_pickup: ShipRocketExchangeOrderBuyerPickupDetails;

  /**
   * Products included in the exchange.
   */
  order_items: ShipRocketExchangeOrderItem[];

  /**
   * Order subtotal.
   */
  sub_total: number;

  /**
   * Shipping charges.
   */
  shipping_charges?: number;

  /**
   * Gift wrap charges.
   */
  giftwrap_charges?: number;

  /**
   * Total discount.
   */
  total_discount?: number;

  /**
   * Transaction charges.
   */
  transaction_charges?: number;

  /**
   * Return package dimensions.
   */
  return_package: ShipRocketExchangeOrderPackageDimensions;

  /**
   * Exchange package dimensions.
   */
  exchange_package: ShipRocketExchangeOrderPackageDimensions;

  /**
   * Reason code for return.
   */
  return_reason: string;
}

/**
 * Shipping buyer details.
 */
export interface ShipRocketExchangeOrderBuyerShippingDetails {
  first_name: string;
  last_name?: string;
  email?: string;
  address: string;
  address_2?: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
  phone: string;
}

/**
 * Pickup buyer details.
 */
export interface ShipRocketExchangeOrderBuyerPickupDetails {
  first_name: string;
  last_name?: string;
  email?: string;
  address: string;
  address_2?: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
  phone: string;
}

/**
 * Exchange order item.
 */
export interface ShipRocketExchangeOrderItem {
  /**
   * Product name.
   */
  name: string;

  /**
   * Selling price.
   */
  selling_price: number;

  /**
   * Quantity.
   */
  units: number;

  /**
   * HSN code.
   */
  hsn: string;

  /**
   * Seller SKU.
   */
  sku: string;

  /**
   * Tax amount.
   */
  tax?: number;

  /**
   * Discount amount.
   */
  discount?: number;

  /**
   * Exchange item identifier.
   */
  exchange_item_id?: string;

  /**
   * Exchange item name.
   */
  exchange_item_name: string;

  /**
   * Exchange item SKU.
   */
  exchange_item_sku: string;
}

/**
 * Package dimensions.
 */
export interface ShipRocketExchangeOrderPackageDimensions {
  /**
   * Length in centimeters.
   */
  length: number;

  /**
   * Breadth in centimeters.
   */
  breadth: number;

  /**
   * Height in centimeters.
   */
  height: number;

  /**
   * Weight in kilograms.
   */
  weight: number;
}
/**
 * Response returned by the ShipRocket Create Exchange Order API.
 */
export interface ShipRocketCreateExchangeOrderResponse {
  /**
   * Indicates whether the exchange order was created successfully.
   */
  success: boolean;

  /**
   * Exchange order details.
   */
  data: ShipRocketCreateExchangeOrderResponseData;
}

/**
 * Response payload.
 */
export interface ShipRocketCreateExchangeOrderResponseData {
  /**
   * Details of the newly created forward (exchange) order.
   */
  forward_orders: ShipRocketCreateExchangeOrderOrderDetails;

  /**
   * Details of the newly created return order.
   */
  return_orders: ShipRocketCreateExchangeOrderOrderDetails;
}

/**
 * Order details returned for both forward and return orders.
 */
export interface ShipRocketCreateExchangeOrderOrderDetails {
  /**
   * ShipRocket order ID.
   */
  order_id: number;

  /**
   * Merchant/Channel order ID.
   *
   * Example:
   * "EX_TEST_101"
   */
  channel_order_id: string;

  /**
   * ShipRocket shipment ID.
   */
  shipment_id: number;

  /**
   * Current order status.
   *
   * Examples:
   * - "NEW"
   * - "RETURN PENDING"
   */
  status: string;

  /**
   * Numeric status code.
   */
  status_code: number;

  /**
   * Assigned AWB number.
   *
   * Empty string if not yet assigned.
   */
  awb_code: string;

  /**
   * Assigned courier company ID.
   *
   * Empty string if not yet assigned.
   */
  courier_company_id: string;

  /**
   * Assigned courier name.
   *
   * Empty string if not yet assigned.
   */
  courier_name: string;
}
/**
 * Root response object for Shiprocket's Get Specific Order Details API.
 */
export interface ShipRocketGetOrderDetails {
  /** The core object containing all order, shipping, and product details. */
  data: ShipRocketGetOrderData;
}

/**
 * The core order data containing customer, shipping, and billing information.
 */
export interface ShipRocketGetOrderData {
  /** Shiprocket's internal unique identifier for this order. */
  id: number;
  /** The internal ID of the sales channel (e.g., Shopify, Custom API) where the order originated. */
  channel_id: number;
  /** The name of the sales channel (e.g., "MANUAL1", "Shopify"). */
  channel_name: string;
  /** The base code representing the channel type (e.g., "CS" for Custom). */
  base_channel_code: string;
  /** Flag indicating if the order is international (1) or domestic (0). */
  is_international: number;
  /** Flag indicating if the shipment contains only documents (1) or parcels/goods (0). */
  is_document: number;
  /** The original order ID from your primary sales channel or database. */
  channel_order_id: string;
  /** The full name of the customer who placed the order. */
  customer_name: string;
  /** The email address of the customer. */
  customer_email: string;
  /** The primary contact phone number of the customer. */
  customer_phone: string;
  /** The primary delivery address line provided by the customer. */
  customer_address: string;
  /** The secondary delivery address line, if provided. */
  customer_address_2: string | null;
  /** The city for the delivery address. */
  customer_city: string;
  /** The state or province for the delivery address. */
  customer_state: string;
  /** The postal code (PIN code) for the delivery address. */
  customer_pincode: string;
  /** The country for the delivery address. */
  customer_country: string;
  /** The unique code assigned to the pickup location. */
  pickup_code: string;
  /** The name or alias of the pickup location. */
  pickup_location: string;
  /** The internal Shiprocket ID for the pickup location. */
  pickup_location_id: string;
  /** The specific pickup request ID generated when scheduling a pickup. */
  pickup_id: string;
  /** The type of shipping service requested (e.g., Essential, Express). */
  ship_type: string;
  /** The mode of courier transport (e.g., Surface, Air). */
  courier_mode: string;
  /** The currency code used for the order's financial values (e.g., "INR"). */
  currency: string;
  /** The numeric country code for the delivery destination. */
  country_code: number;
  /** The exchange rate applied if converting from USD. */
  exchange_rate_usd: number;
  /** The exchange rate applied if converting to INR. */
  exchange_rate_inr: number;
  /** Shiprocket's internal numeric code representing the state. */
  state_code: number;
  /** The current status of the customer's payment. */
  payment_status: string;
  /** The specific delivery routing code used by couriers. */
  delivery_code: string;
  /** The total grand amount of the order. */
  total: number;
  /** The total order value represented in INR. */
  total_inr: number;
  /** The total order value represented in USD. */
  total_usd: number;
  /** The net total amount payable or paid for the order as a string. */
  net_total: string;
  /** Any additional miscellaneous charges applied to the order. */
  other_charges: string;
  /** Any additional miscellaneous discounts applied to the order. */
  other_discounts: string;
  /** Charges applied specifically for gift wrapping services. */
  giftwrap_charges: string;
  /** Flag indicating if expedited shipping was requested (1 for yes, 0 for no). */
  expedited: number;
  /** The Service Level Agreement timeframe for delivery (e.g., "2 days"). */
  sla: string;
  /** The Cash on Delivery amount to be collected. 0 if prepaid. */
  cod: number;
  /** The total tax amount applied to the order. */
  tax: number;
  /** Specific cess applied for shipments within or to Kerala. */
  total_kerala_cess: string;
  /** The total discount value applied to the order. */
  discount: number;
  /** The current high-level status of the order (e.g., "RETURN PENDING", "NEW"). */
  status: string;
  /** A more granular sub-status providing detail on the current state. */
  sub_status: string | null;
  /** Shiprocket's internal numeric status code representing the order state. */
  status_code: number;
  /** The overarching master status category for the order. */
  master_status: string;
  /** The method of payment used (e.g., "prepaid", "cod"). */
  payment_method: string;
  /** The purpose of the shipment, typically used for international customs (e.g., Commercial, Gift). */
  purpose_of_shipment: number;
  /** The date and time the order was created in the original sales channel. */
  channel_created_at: string;
  /** The date and time the order was imported or created in Shiprocket. */
  created_at: string;
  /** The date the order was placed. */
  order_date: string;
  /** The date and time the order details were last modified in Shiprocket. */
  updated_at: string;
  /** Array of individual product items included in this order. */
  products: ShipRocketGetOrderProduct[];
  /** The seller's internal invoice number for this order. */
  invoice_no: string;
  /** The shipment packaging and courier assignment details. */
  shipments: ShipRocketGetOrderShipment;
  /** The tracking, weight, and pricing data related to the Air Waybill (AWB). */
  awb_data: ShipRocketGetOrderAwbData;
  /** Details regarding shipping insurance if opted by the seller. */
  order_insurance: ShipRocketGetOrderInsurance;
  /** Data containing the address and contact details for processing a return pickup. */
  return_pickup_data: ShipRocketGetOrderReturnPickup;
  /** The URL to the seller's company logo, if configured. */
  company_logo: string | null;
  /** Flag indicating if the items in this order are eligible for return (1) or not (0). */
  allow_return: number;
  /** Flag indicating if this specific order is a return shipment (1) or forward shipment (0). */
  is_return: number;
  /** Flag indicating if the order lacks required information to process (1) or is complete (0). */
  is_incomplete: number;
  /** Any validation errors or API errors associated with processing this order. */
  errors: any | null;
  /** A specific code associated with the payment gateway transaction. */
  payment_code: string | null;
  /** Flag indicating if a discount coupon should be visible on the invoice. */
  coupon_is_visible: boolean;
  /** The specific coupon codes applied to this order. */
  coupons: string;
  /** The city for the billing address. */
  billing_city: string;
  /** The name of the person being billed. */
  billing_name: string;
  /** The email address for billing communications. */
  billing_email: string;
  /** The primary phone number for billing communications. */
  billing_phone: string;
  /** A secondary phone number for billing. */
  billing_alternate_phone: string;
  /** The state or province name for the billing address. */
  billing_state_name: string;
  /** The primary line for the billing address. */
  billing_address: string;
  /** The country name for the billing address. */
  billing_country_name: string;
  /** The postal/PIN code for the billing address. */
  billing_pincode: string;
  /** The secondary line for the billing address. */
  billing_address_2: string;
  /** The mobile country code for the billing phone number (e.g., "+91"). */
  billing_mobile_country_code: string;
  /** The ISD code for the billing phone number. */
  isd_code: string;
  /** Shiprocket's internal ID for the billing state. */
  billing_state_id: string;
  /** Shiprocket's internal ID for the billing country. */
  billing_country_id: string;
  /** A text description of the freight charges (e.g., "Forward charges"). */
  freight_description: string;
  /** The name of the reseller, if applicable. */
  reseller_name: string;
  /** Flag indicating if the shipping address is the same as the billing address (1 for yes, 0 for no). */
  shipping_is_billing: number;
  /** The name of the company shipping the order. */
  company_name: string;
  /** The title or label applied to the shipping method. */
  shipping_title: string;
  /** Flag indicating if the order should sync back updates to the originating channel. */
  allow_channel_order_sync: boolean;
  /** UI tooltip text used in the Shiprocket dashboard for this order. */
  'uib-tooltip-text': string;
  /** The ID used to reference this order in external API calls. */
  api_order_id: string;
  /** Flag indicating if this order supports multi-box shipments (1 for yes, 0 for no). */
  allow_multiship: number;
  /** Array of sub-orders if this order was split into multiple shipments. */
  other_sub_orders: any[];
  /** Redundant block containing simplified shipping and physical attributes. */
  others: ShipRocketGetOrderOthers;
  /** Flag indicating if the order details have been verified by the seller (1 for yes, 0 for no). */
  is_order_verified: number;
  /** Additional rules, tags, and flags regarding Quality Control and Dangerous Goods. */
  extra_info: ShipRocketGetOrderExtraInfo;
  /** Flag indicating if this order is a detected duplicate (1 for yes, 0 for no). */
  dup: number;
  /** Flag denoting if the seller is categorized under Shiprocket's Blackbox program. */
  is_blackbox_seller: boolean;
  /** The method of shipping selected (e.g., "SR" for Shiprocket). */
  shipping_method: string;
  /** Details regarding how refunds should be processed for this order. */
  refund_detail: ShipRocketGetOrderRefundDetail;
  /** Array of available or selected pickup addresses for this order. */
  pickup_address: any[];
  /** The government-issued E-way bill number attached to this shipment. */
  eway_bill_number: string;
  /** The URL to download or view the E-way bill document. */
  eway_bill_url: string;
  /** Flag indicating if an E-way bill is legally required for this shipment based on value/state. */
  eway_required: boolean;
  /** The Invoice Reference Number used for GST e-invoicing. */
  irn_no: string;
  /** Data related to Shiprocket Engage (WhatsApp communication suite), if enabled. */
  engage: any | null;
  /** Flag indicating if the seller is currently permitted to edit the order details. */
  seller_can_edit: boolean;
  /** Flag indicating if the seller is currently permitted to cancel the order. */
  seller_can_cancell: boolean;
  /** Flag indicating if the order has passed the shipping phase. */
  is_post_ship_status: boolean;
  /** Custom tags applied to the order for internal filtering. */
  order_tag: string;
  /** The current status of the Quality Control check for return orders. */
  qc_status: string;
  /** The reason provided if a Quality Control check fails. */
  qc_reason: string;
  /** URL to the image uploaded during the Quality Control process. */
  qc_image: string;
  /** Detailed Quality Control parameters for the individual products in the order. */
  product_qc: ShipRocketGetOrderProductQc[];
  /** Any special requests made by the seller regarding this order. */
  seller_request: any | null;
  /** Flag indicating if the payment mode can still be changed (e.g., COD to Prepaid). */
  change_payment_mode: boolean;
  /** The Estimated Time of Delivery provided by the courier. */
  etd_date: string | null;
  /** The date the shipment was marked 'Out for Delivery'. */
  out_for_delivery_date: string | null;
  /** The exact date the shipment was successfully delivered. */
  delivered_date: string | null;
  /** The date Shiprocket remitted the COD amount to the seller's bank account. */
  remittance_date: string;
  /** The Unique Transaction Reference number for the COD bank remittance. */
  remittance_utr: string;
  /** The current status of the COD remittance (e.g., Pending, Completed). */
  remittance_status: string;
  /** Flag indicating if insurance was explicitly excluded for this order. */
  insurance_excluded: boolean;
  /** Flag indicating if the shipment dimensions can still be updated by the seller. */
  can_edit_dimension: boolean;
}

/**
 * Represents individual items within the order.
 */
export interface ShipRocketGetOrderProduct {
  /** Shiprocket's internal ID for this specific order item. */
  id: number;
  /** The internal ID of the parent order this item belongs to. */
  order_id: number;
  /** Shiprocket's internal ID representing the global catalog product. */
  product_id: number;
  /** The name of the product. */
  name: string;
  /** The Stock Keeping Unit identifier for the product. */
  sku: string;
  /** The text description of the product. */
  description: string;
  /** The unique item ID from the originating sales channel. */
  channel_order_product_id: string;
  /** The SKU identifier from the originating sales channel. */
  channel_sku: string;
  /** The Harmonized System of Nomenclature code for taxation purposes. */
  hsn: string;
  /** The model number or name of the product. */
  model: string | null;
  /** The manufacturer of the product. */
  manufacturer: string | null;
  /** The brand name of the product. */
  brand: string;
  /** The color variant of the product. */
  color: string;
  /** The size variant of the product. */
  size: string | null;
  /** The key for any custom fields associated with the item. */
  custom_field: string;
  /** The value for the custom field. */
  custom_field_value: string;
  /** The string representation of the custom field value. */
  custom_field_value_string: string;
  /** The weight of a single unit of this product. */
  weight: number;
  /** The L x B x H dimensions of a single unit of this product. */
  dimensions: string;
  /** The base price of the product unit. */
  price: number;
  /** The manufacturing or wholesale cost of the product. */
  cost: number;
  /** The Maximum Retail Price printed on the product. */
  mrp: number;
  /** The number of units of this product purchased in the order. */
  quantity: number;
  /** The number of units eligible for return. */
  returnable_quantity: number;
  /** The tax amount applied to this specific product line item. */
  tax: number;
  /** The active status of the product line item. */
  status: number;
  /** The final calculated total for this product line (price * quantity + tax - discount). */
  net_total: number;
  /** The discount amount applied specifically to this product. */
  discount: number;
  /** Array of specific options chosen for this product (e.g., custom engravings). */
  product_options: any[];
  /** The final price the product was sold for to the customer. */
  selling_price: number;
  /** The percentage of tax applied to this product. */
  tax_percentage: number;
  /** The discount amount that includes the tax value. */
  discount_including_tax: number;
  /** The category this product belongs to in the originating sales channel. */
  channel_category: string;
  /** The type of primary packaging material required for this product. */
  packaging_material: string;
  /** Any supplementary packaging material required. */
  additional_material: string;
  /** Flag indicating if this product was given away for free (e.g., Buy 1 Get 1). */
  is_free_product: string;
}

/**
 * Contains the package and volumetric details passed to Shiprocket during creation.
 */
export interface ShipRocketGetOrderShipment {
  /** Shiprocket's internal identifier for this specific shipment package. */
  id: number;
  /** The ID of the parent order this shipment belongs to. */
  order_id: number;
  /** The ID of the specific product if this is a single-item shipment. */
  order_product_id: number | null;
  /** The ID of the originating sales channel. */
  channel_id: number;
  /** The shipment routing code. */
  code: string;
  /** The calculated shipping cost for this package. */
  cost: string;
  /** The tax applied to the shipping cost. */
  tax: string;
  /** The Air Waybill number assigned by the courier partner. */
  awb: string | null;
  /** The Air Waybill number used if the package is Returned to Origin (RTO). */
  rto_awb: string;
  /** The date and time the AWB was assigned to this shipment. */
  awb_assign_date: string | null;
  /** The Estimated Time of Departure. */
  etd: string;
  /** The date this specific shipment was delivered. */
  delivered_date: string;
  /** The total quantity of items packed inside this shipment. */
  quantity: number;
  /** The Cash on Delivery handling fee applied by the courier. */
  cod_charges: string;
  /** Reference number for the shipment. */
  number: string | null;
  /** Name associated with the shipment. */
  name: string | null;
  /** ID linking to a specific order item. */
  order_item_id: string | null;
  /** The dead physical weight declared by the seller when creating the shipment. */
  weight: number;
  /** The calculated volumetric weight based on the length, breadth, and height provided. */
  volumetric_weight: number;
  /** The L x B x H string representing the package dimensions declared by the seller. */
  dimensions: string;
  /** Any special delivery instructions or comments attached to the shipment. */
  comment: string;
  /** The name of the assigned courier partner (e.g., Delhivery, Bluedart). */
  courier: string;
  /** Shiprocket's internal numeric ID for the assigned courier partner. */
  courier_id: string;
  /** The ID of the manifest document this shipment was included in. */
  manifest_id: string;
  /** Flag indicating if a manifest escalation has been raised. */
  manifest_escalate: boolean;
  /** The current tracking status of this specific shipment (e.g., "PENDING", "SHIPPED"). */
  status: string;
  /** The International Subscriber Dialing code for the recipient. */
  isd_code: string;
  /** The date and time this shipment record was created. */
  created_at: string;
  /** The date and time this shipment record was last updated. */
  updated_at: string;
  /** The Proof of Delivery status or link provided by the courier. */
  pod: string | null;
  /** The E-way bill number linked directly to this shipment. */
  eway_bill_number: string;
  /** The date the E-way bill was generated. */
  eway_bill_date: string | null;
  /** The parsed length of the package in centimeters. */
  length: number;
  /** The parsed breadth (width) of the package in centimeters. */
  breadth: number;
  /** The parsed height of the package in centimeters. */
  height: number;
  /** The date a Return to Origin (RTO) was initiated by the courier. */
  rto_initiated_date: string;
  /** The date the Returned to Origin (RTO) package was delivered back to the seller. */
  rto_delivered_date: string;
  /** The date the shipment was physically handed over to the courier. */
  shipped_date: string;
  /** URL(s) to images of the packed box uploaded by the seller prior to shipping. */
  package_images: string;
  /** Flag indicating if this shipment is currently in a Return to Origin state. */
  is_rto: boolean;
  /** Flag indicating if an E-way bill is legally required for this specific package. */
  eway_required: boolean;
  /** URL to download the shipping label and invoice PDF. */
  invoice_link: string;
  /** Flag indicating if a hyper-local dark store courier is handling the delivery. */
  is_darkstore_courier: number;
  /** Any custom courier allocation rules triggered for this shipment. */
  courier_custom_rule: string;
  /** Flag indicating if all items in the order are contained within this single package. */
  is_single_shipment: boolean;
}

/**
 * Central object for identifying weight discrepancies and actual courier billing data.
 */
export interface ShipRocketGetOrderAwbData {
  /** The Air Waybill number assigned by the courier partner. */
  awb: string;
  /** The weight the seller entered into the system when generating the label. */
  applied_weight: string;
  /** The actual weight determined by the courier's sorting facility. (Compare this to applied_weight to detect disputes). */
  charged_weight: string;
  /** The final weight value used to calculate the freight invoice. */
  billed_weight: string;
  /** The alphanumeric code used by the courier to route the package to the correct hub. */
  routing_code: string;
  /** The routing code used to send the package back to the seller if delivery fails. */
  rto_routing_code: string;
  /** Detailed breakdown of the monetary charges applied to this AWB. */
  charges: ShipRocketGetOrderAwbCharges;
}

/**
 * Breakdown of the financial charges applied by the courier based on weight and zone.
 */
export interface ShipRocketGetOrderAwbCharges {
  /** The geographic zone the shipment crossed (e.g., Zone A for local, Zone E for national). */
  zone: string;
  /** The handling fee charged by the courier for collecting cash on delivery. */
  cod_charges: string;
  /** The estimated freight amount based solely on the seller's applied weight. */
  applied_weight_amount: string;
  /** The total actual shipping fees levied by the courier. */
  freight_charges: string;
  /** The seller-declared weight used in the initial freight estimate calculation. */
  applied_weight: string;
  /** The courier-measured weight used in the actual freight calculation. */
  charged_weight: string;
  /** The actual monetary amount charged based on the courier's measured weight. */
  charged_weight_amount: string;
  /** The monetary amount charged if the package is Returned to Origin based on the courier's weight. */
  charged_weight_amount_rto: string;
  /** The estimated Return to Origin cost based on the seller's applied weight. */
  applied_weight_amount_rto: string;
  /** The identifier for the tier of service used (e.g., surface, express). */
  service_type_id: string;
}

/**
 * Details regarding the shipment protection and insurance coverage.
 */
export interface ShipRocketGetOrderInsurance {
  /** The status of the insurance (e.g., "Yes", "No"). */
  insurance_status: string;
  /** The policy number issued by the insurance provider. */
  policy_no: string;
  /** Flag indicating if the seller is currently eligible to file an insurance claim. */
  claim_enable: boolean;
}

/**
 * Details for the location where the package will be picked up or returned to.
 */
export interface ShipRocketGetOrderReturnPickup {
  /** Internal ID for the pickup address record. */
  id: number;
  /** The contact name at the pickup location. */
  name: string;
  /** The contact email at the pickup location. */
  email: string;
  /** Primary line of the pickup address. */
  address: string;
  /** Secondary line of the pickup address. */
  address_2: string;
  /** The city of the pickup location. */
  city: string;
  /** The state of the pickup location. */
  state: string;
  /** The country of the pickup location. */
  country: string;
  /** The postal code of the pickup location. */
  pin_code: string;
  /** The contact phone number for the pickup location. */
  phone: string;
  /** The geographical latitude of the pickup location. */
  lat: number | null;
  /** The geographical longitude of the pickup location. */
  long: number | null;
  /** The ID of the order associated with this pickup. */
  order_id: number;
  /** The timestamp when this pickup address record was created. */
  created_at: string;
  /** The timestamp when this pickup address record was last updated. */
  updated_at: string;
}

/**
 * Flattened helper block summarizing key physical and shipping attributes.
 */
export interface ShipRocketGetOrderOthers {
  /** The physical weight of the entire order shipment. */
  weight: string;
  /** The total number of items in the order. */
  quantity: number;
  /** The buyer's Page-Scoped ID (used for Facebook Messenger integrations). */
  buyer_psid: string | null;
  /** The overall physical dimensions of the order package. */
  dimensions: string;
  /** The external API order reference. */
  api_order_id: string;
  /** The shipping company's name. */
  company_name: string;
  /** The currency code for the order's financial transactions. */
  currency_code: string;
  /** The total number of distinct packages generated for this order. */
  package_count: string;
  /** The destination city for the shipment. */
  shipping_city: string;
  /** The name of the person receiving the shipment. */
  shipping_name: string;
  /** The email address of the person receiving the shipment. */
  shipping_email: string;
  /** The phone number of the person receiving the shipment. */
  shipping_phone: string;
  /** The destination state for the shipment. */
  shipping_state: string;
  /** An optional custom order reference ID provided by the seller. */
  custom_order_id: string | null;
  /** The International Subscriber Dialing code for the billing contact. */
  billing_isd_code: string;
  /** If this is a return order, the ID of the original forward order. */
  forward_order_id: string | null;
  /** The primary destination address line. */
  shipping_address: string;
  /** The monetary amount charged to the customer for shipping. */
  shipping_charges: string;
  /** The destination country. */
  shipping_country: string;
  /** The destination postal code. */
  shipping_pincode: string;
  /** The secondary destination address line. */
  shipping_address_2: string;
}

/**
 * System flags related to Quality Control checks and Dangerous Goods declarations.
 */
export interface ShipRocketGetOrderExtraInfo {
  /** Flag indicating if a Quality Control check is required before pickup (1 for yes). */
  qc_check: number;
  /** Comma-separated list of attributes the delivery agent must check during return pickup. */
  qc_params: string;
  /** Internal code classifying the type of order. */
  order_type: number;
  /** Flag indicating if Amazon classifies the shipment as Dangerous Goods. */
  amazon_dg_status: boolean;
  /** If this is a return, the ID of the original forward order. */
  forward_order_id: string;
  /** Flag indicating if Bluedart classifies the shipment as Dangerous Goods. */
  bluedart_dg_status: boolean;
  /** Flag indicating if other couriers classify the shipment as Dangerous Goods. */
  other_courier_dg_status: boolean;
  /** Flag indicating if shipping insurance was automatically opted into during order creation. */
  insurace_opted_at_order_creation: boolean;
}

/**
 * Details regarding how and where a refund should be deposited for cancelled/returned orders.
 */
export interface ShipRocketGetOrderRefundDetail {
  /** The method of refund (e.g., "Store Credits", "Bank Transfer"). */
  refund_mode: string;
  /** The name of the bank account holder receiving the refund. */
  account_holder_name: string;
  /** The bank account number receiving the refund. */
  account_number: string;
  /** The IFSC routing code for the destination bank account. */
  bank_ifsc: string;
  /** The name of the banking institution. */
  bank_name: string;
}

/**
 * Contains the specific Quality Control criteria attached to an individual product.
 */
export interface ShipRocketGetOrderProductQc {
  /** The internal ID of the product being subjected to Quality Control. */
  product_id: number;
  /** The required validation data for the QC check. */
  qc_values: ShipRocketGetOrderProductQcValues;
}

/**
 * The expected attributes the delivery agent must verify against the physical item during a return.
 */
export interface ShipRocketGetOrderProductQcValues {
  /** Verification data for the product's name. */
  qc_product_name: ShipRocketGetOrderProductQcValue;
  /** Verification data for the product's size. */
  qc_size: ShipRocketGetOrderProductQcValue;
  /** Verification data for the product's color. */
  qc_color: ShipRocketGetOrderProductQcValue;
  /** Verification data for the product's brand. */
  qc_brand: ShipRocketGetOrderProductQcValue;
  /** Visual verification data (image URL) for the product. */
  qc_product_image: ShipRocketGetOrderProductQcValue;
}

/**
 * A standard key-value pairing for a specific Quality Control parameter.
 */
export interface ShipRocketGetOrderProductQcValue {
  /** The expected value the agent should look for (e.g., "watch", "Blue", or an image URL). */
  value: string;
  /** The human-readable label for the parameter (e.g., "Product Name", "Color"). */
  name: string;
}
