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

export const SHIPROCKET_URLS = {
  LOGIN: `${SHIPROCKET_BASE}/v1/external/auth/login`,
  SERVICEABILITY: `${SHIPROCKET_BASE}/v1/external/courier/serviceability/`,
  CREATE_ORDER: `${SHIPROCKET_BASE}/v1/external/orders/create/adhoc`,
  ASSIGN_AWB: `${SHIPROCKET_BASE}/v1/external/courier/assign/awb`,
  SHIP_ROCKET_COURIER_SERVICEABILITY_API: `${SHIPROCKET_BASE}/v1/external/courier/serviceability/`,
  SHIP_ROCKET_SHIPMENT_PICKUP_API: `${SHIPROCKET_BASE}/v1/external/courier/generate/pickup`,
  SHIP_ROCKET_CREATE_EXCHANGE_ORDER_API: `${SHIPROCKET_BASE}/v1/external/orders/create/exchange`,
  SHIP_ROCKET_CANCEL_A_SHIPMENT_API: `${SHIPROCKET_BASE}/v1/external/orders/cancel`,
  SHIP_ROCKET_LOGIN_API: `${SHIPROCKET_BASE}/v1/external/auth/login`,
  SHIP_ROCKET_ALL_ORDER_DETAILS_API: `${SHIPROCKET_BASE}/v1/external/orders/show`,
  SHIP_ROCKET_CHANGE_UPDATE_PICKUP_LOCATION_OF_CREATED_ORDERS_API: `${SHIPROCKET_BASE}/v1/external/orders/address/pickup`,
  ADD_PICKUP: `${SHIPROCKET_BASE}/v1/external/settings/company/addpickup`,
} as const;


