/**
 * Shiprocket does NOT provide a public sandbox domain.
 * All environments (local, staging, production) use the same base URL:
 *   https://apiv2.shiprocket.in
 *
 * ── Safe testing strategy ──────────────────────────────────────────────
 * 1. In the Shiprocket dashboard → Settings → API → "Add New API User",
 *    create a dedicated test API user with a separate email/password.
 *    Store those in .env as SHIP_ROCKET_TEST_EMAIL / SHIP_ROCKET_TEST_PASSWORD
 *    and point non-production environments to those credentials.
 * 2. Test orders can be cancelled immediately via the dashboard or the
 *    cancel API endpoint; Shiprocket issues a full wallet refund on cancellation.
 * 3. Contact Shiprocket support to understand their current policy on
 *    test wallet recharges — they may waive the minimum top-up requirement
 *    for integration testing so you can simulate a full checkout without
 *    incurring real shipping costs.
 * 4. Never commit production credentials to your repository.
 * ───────────────────────────────────────────────────────────────────────
 */
const SHIPROCKET_BASE = 'https://apiv2.shiprocket.in';

export const SHIPROCKET_APIs = {
  /**
   * Method POST
   * https://apiv2.shiprocket.in/v1/external/auth/login
   *
   * email – required string (max 100 characters)
   * password – required string (max 100 characters)
   */
  LOGIN: `${SHIPROCKET_BASE}/v1/external/auth/login`,
  /**
   * Method GET
   * https://apiv2.shiprocket.in/v1/external/courier/serviceability/
   */
  SERVICEABILITY: `${SHIPROCKET_BASE}/v1/external/courier/serviceability/`,
  /**
   * Method Get
   *
   * Get the order and shipment details of a particular order through this API by passing the Shiprocket order_id in the endpoint URL itself — type in your order_id in place of {id}.
   * EXAMPLE
   * https://apiv2.shiprocket.in/v1/external/orders/show/16167171
   */
  GET_ORDER_DETAILS: `${SHIPROCKET_BASE}/v1/external/orders/show/`,

  /**
   * Method POST
   * https://apiv2.shiprocket.in/v1/external/orders/create/adhoc
   */
  CREATE_ORDER: `${SHIPROCKET_BASE}/v1/external/orders/create/adhoc`,
  /**
   * Method POST
   * https://apiv2.shiprocket.in/v1/external/orders/create
   * This API can be used to create a custom order, the same as the Custom order API, except that you have to specify and select a custom channel to create the order.
   */
  CREATE_CHANNEL_SPECIFIC_ORDER: `${SHIPROCKET_BASE}/v1/external/orders/create`,
  /**
   * Method POST
   * https://apiv2.shiprocket.in/v1/external/courier/assign/awb
   */
  ASSIGN_AWB: `${SHIPROCKET_BASE}/v1/external/courier/assign/awb`,
  /**
   * Method POST
   * https://apiv2.shiprocket.in/v1/external/courier/serviceability/
   */
  REQUEST_FOR_SHIPMENT_PICKUP: `${SHIPROCKET_BASE}/v1/external/courier/generate/pickup`,
  /**
   * Method POST
   * https://apiv2.shiprocket.in/v1/external/orders/cancel
   */
  CANCEL_A_SHIPMENT: `${SHIPROCKET_BASE}/v1/external/orders/cancel`,

  /**
   * Method POST
   * https://apiv2.shiprocket.in/v1/external/orders/show
   */
  ALL_ORDER_DETAILS: `${SHIPROCKET_BASE}/v1/external/orders/show`,
  /**
   * Method POST
   * https://apiv2.shiprocket.in/v1/external/orders/address/pickup
   */
  CHANGE_UPDATE_PICKUP_LOCATION_OF_CREATED_ORDERS: `${SHIPROCKET_BASE}/v1/external/orders/address/pickup`,
  /**
   * Method POST
   * https://apiv2.shiprocket.in/v1/external/settings/company/addpickup
   */
  ADD_PICKUP: `${SHIPROCKET_BASE}/v1/external/settings/company/addpickup`,
  /**
   * Method POST
   * https://apiv2.shiprocket.in/v1/external/courier/generate/pickup
   */
  CREATE_RETURN_ORDER: `${SHIPROCKET_BASE}/v1/external/orders/create/return`,
  /**
   * Method POST
   * https://apiv2.shiprocket.in/v1/external/orders/create/exchange
   */
  CREATE_EXCHANGE_ORDER: `${SHIPROCKET_BASE}/v1/external/orders/create/exchange`,

  /**
   * Method POST
   * https://apiv2.shiprocket.in/v1/external/orders/edit
   * Use this API to update your return orders. Please specify the parameters based on the "action" key.
   */
  UPDATE_RETURN_ORDER: `${SHIPROCKET_BASE}/v1/external/orders/edit`,
  /**
   * Method POST
   * https://apiv2.shiprocket.in/v1/external/orders/update/shipment
   */
  SHIP_ROCKET_UPDATE_ORDER_IN_A_SHIPMENT: `${SHIPROCKET_BASE}/v1/external/orders/update/shipment`,
  /**
   * Method POST
   * https://apiv2.shiprocket.in/v1/external/ndr/{awb}/action
   *
   * awb – required string
   *
   * JSON body – required
   *
   * note – optional string
   */
  SHIP_ROCKET_ACTION_NDR: `${SHIPROCKET_BASE}/v1/external/ndr/`,
} as const;
