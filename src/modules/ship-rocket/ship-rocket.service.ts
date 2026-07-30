import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  BadGatewayException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module.js';
import { logistic_companies } from '../../drizzle/schema/logistics.schema.js';
import { sql } from 'drizzle-orm';
const gotPromise = import('got').then((m) => m.default);

import { SHIPROCKET_APIs } from './constants/ship-rocket.constants.js';
import {
  ShiprocketAddPickupAddress,
  ShiprocketAddPickupAddressResponse,
  ShiprocketCreateOrderPayload,
  ShiprocketCreateOrderResponse,
  ShiprocketGenerateAWBforShipmentResponse,
  ShiprocketReturnOrderPayload,
  ShiprocketReturnOrderResponse,
  ShipRocketRequestForShipmentPickup,
  ShipRocketRequestForShipmentPickupResponse,
  ShipRocketCancelShipmentRequest,
  ShipRocketCancelShipmentResponse,
  ShipRocketCheckServiceabilityRequest,
  ShiprocketCourierServiceabilityResponse,
} from '../../common/Types/shiprocket.js';

/** Hard cap on all outbound Shiprocket requests — prevents connection-pool exhaustion */

/**
 * Safely converts a `got` HTTP error response body into a short, log-safe string.
 *
 * Rationale: When Shiprocket's API gateway goes down (502/503), the response
 * body is raw HTML from Cloudflare or AWS.  Blindly calling
 * JSON.stringify(error.response.body) on that HTML:
 *   1. Produces multi-kilobyte, unreadable stack traces in logs.
 *   2. Can throw a secondary error if the body is an unexpected type.
 *
 * This helper checks the Content-Type header first:
 *  - JSON responses  → JSON.stringify then slice to 500 chars
 *  - Everything else → coerce to string and slice to 300 chars
 */
function safeErrorBody(error: any): string {
  const body = error?.response?.body;
  if (!body) return error?.message ?? 'Unknown error';

  const contentType: string = error?.response?.headers?.['content-type'] ?? '';

  if (contentType.includes('application/json')) {
    try {
      return JSON.stringify(body).slice(0, 500);
    } catch {
      // body might already be a string in some got versions
    }
  }

  // Non-JSON body (HTML 502, plain text, etc.) — slice hard to keep logs clean
  return String(body).slice(0, 300);
}

/**
 * Default timeout for Shiprocket API requests (in milliseconds).
 * This value is used when no explicit timeout is provided for a specific request.
 */
const SHIPROCKET_REQUEST_TIMEOUT_MS = 10_000;

/**
 * In-process promise cache to prevent cache stampede (thundering herd) on
 * cold boot or after a 7-day token expiry.  Without this, 50 concurrent
 * requests hitting an empty Redis cache would all fire parallel /auth/login
 * calls and likely trigger Shiprocket's rate limiter.
 *
 * Key: the Redis cache key for that credential context.
 * Value: the in-flight fetchToken() promise.
 */
const tokenFetchInFlight = new Map<
  string,
  Promise<{ token: string; [k: string]: any }>
>();

@Injectable()
export class ShipRocketService {
  /**
   * Default Redis cache key for Shiprocket authentication.
   * Used when no company-specific credentials are provided.
   */
  private readonly SHIPROCKET_AUTH_CACHE_KEY = 'shiprocket_auth_cache';
  constructor(
    private configService: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @Inject(DRIZZLE) private db: DrizzleService,
  ) {}

  /**
   * Checks serviceability for a given set of shipment parameters.
   * @param data Shipment parameters including pincodes, dimensions, weight, and shipment type.
   * @param credentials Optional authentication credentials.
   * @param companyId Optional company identifier.
   * @returns The serviceability response from Shiprocket.
   * @throws InternalServerErrorException if the serviceability check fails.
   */
  async getServiceability(
    data: ShipRocketCheckServiceabilityRequest,
    credentials?: { email?: string; password?: string },
    companyId?: string,
  ) {
    const got = await gotPromise;
    const token = await this.getToken(credentials, companyId);

    const url = SHIPROCKET_APIs.SERVICEABILITY;
    const params: Record<string, string | number> = {
      pickup_postcode: Number(data.pickup_postcode),
      delivery_postcode: Number(data.delivery_postcode),
      weight: String(data.weight),
    };

    if (data.cod !== undefined) params.cod = data.cod;
    if (data.declared_value !== undefined)
      params.declared_value = Number(data.declared_value);
    if (data.qc_check !== undefined) params.qc_check = data.qc_check;
    if (data.mode !== undefined) params.mode = data.mode;
    if (data.is_return !== undefined) params.is_return = data.is_return;
    if (data.length !== undefined) params.length = data.length;
    if (data.breadth !== undefined) params.breadth = data.breadth;
    if (data.height !== undefined) params.height = data.height;
    if (data.couriers_type !== undefined)
      params.couriers_type = data.couriers_type;
    if (data.only_local !== undefined) params.only_local = data.only_local;
    if (data.order_id !== undefined) params.order_id = data.order_id;

    const res: ShiprocketCourierServiceabilityResponse = await got
      .get(url, {
        searchParams: params,
        headers: { Authorization: `Bearer ${token}` },
        timeout: { request: SHIPROCKET_REQUEST_TIMEOUT_MS },
      })
      .json();

    const filteredCouriers = res.data.available_courier_companies?.map(
      (c: any) => ({
        courier_company_id: c.courier_company_id,
        courier_name: c.courier_name,
        rate: c.rate,
        rating: c.rating,
        estimated_delivery_days: c.estimated_delivery_days,
        delivery_performance: c.delivery_performance,
        pickup_performance: c.pickup_performance,
        cod_charges: c.cod_charges,
        is_surface: c.is_surface,
      }),
    );

    // Fire-and-forget async update of logistic companies metadata in DB
    if (res.data.available_courier_companies?.length) {
      const recordsToUpsert = res.data.available_courier_companies.map(
        (c: any) => ({
          courier_company_id: c.courier_company_id,
          courier_name: c.courier_name || 'Unknown',
          is_cod_supported: c.cod === 1,
          is_surface: c.is_surface === true,
          delivery_score: Number(c.delivery_performance) || 0,
          pickup_score: Number(c.pickup_performance) || 0,
          rating: Number(c.rating) || 0,
          min_weight: Number(c.min_weight) || null,
          charge_weight: Number(c.charge_weight) || null,
          volumetric_max_weight: c.volumetric_max_weight
            ? Number(c.volumetric_max_weight)
            : null,
          last_seen: new Date(),
        }),
      );

      // Non-blocking query execution to sync courier metrics
      this.db
        .insert(logistic_companies)
        .values(recordsToUpsert)
        .onConflictDoUpdate({
          target: logistic_companies.courier_company_id,
          set: {
            courier_name: sql`EXCLUDED.courier_name`,
            is_cod_supported: sql`EXCLUDED.is_cod_supported`,
            is_surface: sql`EXCLUDED.is_surface`,
            delivery_score: sql`EXCLUDED.delivery_score`,
            pickup_score: sql`EXCLUDED.pickup_score`,
            rating: sql`EXCLUDED.rating`,
            min_weight: sql`EXCLUDED.min_weight`,
            charge_weight: sql`EXCLUDED.charge_weight`,
            volumetric_max_weight: sql`EXCLUDED.volumetric_max_weight`,
            last_seen: sql`EXCLUDED.last_seen`,
          },
        })
        .execute()
        .catch((err) => {});
    }

    return res;
  }

  /**
   * Creates a draft order with Shiprocket.
   * @param payload The order payload containing shipment details.
   * @param credentials Optional authentication credentials.
   * @param companyId Optional company identifier.
   * @returns The created order response from Shiprocket.
   * @throws InternalServerErrorException if the order creation fails.
   * @throws BadGatewayException if authentication fails after token refresh.
   */
  async createDraftOrder(
    payload: ShiprocketCreateOrderPayload,
    credentials?: { email?: string; password?: string },
    companyId?: string,
  ): Promise<ShiprocketCreateOrderResponse> {
    const got = await gotPromise;
    const cacheKey = this._buildCacheKey(credentials, companyId);
    const token = await this.getToken(credentials, companyId);
    const url = SHIPROCKET_APIs.CREATE_ORDER;
    try {
      const res: ShiprocketCreateOrderResponse = await got
        .post(url, {
          json: payload,
          headers: {
            'content-type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
          timeout: { request: SHIPROCKET_REQUEST_TIMEOUT_MS },
        })
        .json();
      return res;
    } catch (error: any) {
      // 401 recovery: bust the cached token and retry exactly once
      if (error?.response?.statusCode === 401) {
        await this.cacheManager.del(cacheKey);
        const freshToken = await this.getToken(credentials, companyId);
        try {
          return await got
            .post(url, {
              json: payload,
              headers: {
                'content-type': 'application/json',
                Accept: 'application/json',
                Authorization: `Bearer ${freshToken}`,
              },
              timeout: { request: SHIPROCKET_REQUEST_TIMEOUT_MS },
            })
            .json<ShiprocketCreateOrderResponse>();
        } catch (retryError: any) {
          throw new BadGatewayException(
            'Shiprocket authentication failed after token refresh. Check your credentials.',
          );
        }
      }
      const errorMsg = safeErrorBody(error);
      throw new InternalServerErrorException(
        `Shiprocket draft order creation failed: ${errorMsg}`,
        { cause: error },
      );
    }
  }

  /**
   * Generates a Shiprocket AWB (Airway Bill) for a shipment.
   * Automatically attempts token refresh on 401 Unauthorized errors.
   * @param shipmentId The ID of the shipment.
   * @param courierId Optional courier company ID.
   * @param credentials Optional authentication credentials.
   * @param companyId Optional company identifier.
   * @returns The AWB generation response.
   * @throws InternalServerErrorException if AWB generation fails.
   * @throws BadGatewayException if authentication fails.
   */
  async generateAWB(
    shipmentId: number,
    courierId?: number,
    credentials?: { email?: string; password?: string },
    companyId?: string,
  ): Promise<ShiprocketGenerateAWBforShipmentResponse> {
    const got = await gotPromise;
    const cacheKey = this._buildCacheKey(credentials, companyId);
    const token = await this.getToken(credentials, companyId);
    const url = SHIPROCKET_APIs.ASSIGN_AWB;
    try {
      const res: ShiprocketGenerateAWBforShipmentResponse = await got
        .post(url, {
          json: {
            shipment_id: shipmentId,
            ...(courierId && { courier_id: courierId }),
          },
          headers: {
            'content-type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
          timeout: { request: SHIPROCKET_REQUEST_TIMEOUT_MS },
        })
        .json();
      return res;
    } catch (error: any) {
      // 401 recovery: bust the cached token and retry exactly once
      if (error?.response?.statusCode === 401) {
        await this.cacheManager.del(cacheKey);
        const freshToken = await this.getToken(credentials, companyId);
        try {
          return await got
            .post(url, {
              json: {
                shipment_id: shipmentId,
                ...(courierId && { courier_id: courierId }),
              },
              headers: {
                'content-type': 'application/json',
                Accept: 'application/json',
                Authorization: `Bearer ${freshToken}`,
              },
              timeout: { request: SHIPROCKET_REQUEST_TIMEOUT_MS },
            })
            .json<ShiprocketGenerateAWBforShipmentResponse>();
        } catch (retryError: any) {
          throw new BadGatewayException(
            'Shiprocket authentication failed after token refresh. Check your credentials.',
          );
        }
      }
      const errorMsg = safeErrorBody(error);
      throw new InternalServerErrorException(
        `Shiprocket AWB generation failed: ${errorMsg}`,
        { cause: error },
      );
    }
  }

  /**
   * Retrieves an authentication token for Shiprocket API.
   * Supports both global (default) and per-company credentials.
   * Implements in-process promise caching to prevent concurrent token requests.
   * @param credentials Optional authentication credentials (email and password).
   * @param companyId Optional company identifier for per-company credentials.
   * @returns The authentication token string.
   */
  async getToken(
    credentials?: { email?: string; password?: string },
    companyId?: string,
  ): Promise<string> {
    const isStandalone = !!(
      credentials?.email &&
      credentials?.password &&
      companyId
    );
    const cacheKey = isStandalone
      ? `${this.SHIPROCKET_AUTH_CACHE_KEY}:${companyId}`
      : this.SHIPROCKET_AUTH_CACHE_KEY;

    /**
     * Fast path: token already in Redis cache
     */
    const cachedToken: any = await this.cacheManager.get(cacheKey);
    if (cachedToken) {
      return typeof cachedToken === 'string' ? cachedToken : cachedToken.token;
    }

    /**
     * Stampede guard: if another request is already fetching this token,
     * share its promise instead of firing a second /auth/login call.
     */
    const existing = tokenFetchInFlight.get(cacheKey);
    if (existing) {
      const tokenResponse = await existing;
      return tokenResponse.token;
    }

    /**
     * This request wins the race — fetch the token and share the promise.
     */
    const fetchPromise = this.fetchToken(
      credentials?.email,
      credentials?.password,
    );
    tokenFetchInFlight.set(cacheKey, fetchPromise);

    try {
      /**
       * token reposne fetch from promise
       */
      const tokenResponse = await fetchPromise;
      /**
       * 7 days in ms
       */
      const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
      /**
       * Set token in cache
       */
      await this.cacheManager.set(cacheKey, tokenResponse, sevenDaysInMs);
      /**
       * Return token
       */
      return tokenResponse.token;
    } finally {
      // Always clean up the in-flight map so future requests use the cache
      tokenFetchInFlight.delete(cacheKey);
    }
  }
  /**
   * Fetches a new authentication token from Shiprocket.
   * @param email Optional email override.
   * @param password Optional password override.
   * @returns The authentication response containing the token.
   */
  async fetchToken(
    email?: string,
    password?: string,
  ): Promise<{
    company_id: number;
    created_at: string;
    email: string;
    first_name: string;
    id: number;
    last_name: string;
    token: string;
  }> {
    const got = await gotPromise;
    const loginEmail =
      email || this.configService.get<string>('SHIP_ROCKET_EMAIL');
    const loginPassword =
      password || this.configService.get<string>('SHIP_ROCKET_PASSWORD');
    /**
      Remove clean quotes if present in env strings
    */
    const cleanedEmail = loginEmail?.replace(/['"]/g, '').trim();
    const cleanedPassword = loginPassword?.replace(/['"]/g, '').trim();

    const url = SHIPROCKET_APIs.LOGIN;
    try {
      const res: {
        company_id: number;
        created_at: string;
        email: string;
        first_name: string;
        id: number;
        last_name: string;
        token: string;
      } = await got
        .post(url, {
          json: {
            email: cleanedEmail,
            password: cleanedPassword,
          },
          headers: {
            'content-type': 'application/json',
            Accept: 'application/json',
          },
          timeout: { request: SHIPROCKET_REQUEST_TIMEOUT_MS },
        })
        .json();

      return res;
    } catch (error: any) {
      const errorBody = safeErrorBody(error);
      if (error?.response?.statusCode === 401) {
        throw new BadGatewayException(
          `Shiprocket authentication failed: ${errorBody}`,
          { cause: error },
        );
      }
      throw new InternalServerErrorException(
        `Shiprocket authentication failed: ${errorBody}`,
        { cause: error },
      );
    }
  }

  /**
   * Adds a pickup location to Shiprocket.
   * @param data The pickup location data.
   * @param credentials Optional authentication credentials.
   * @param companyId Optional company identifier.
   * @returns The pickup location response.
   */
  async addPickupLocation(
    data: ShiprocketAddPickupAddress,
    credentials?: { email?: string; password?: string },
    companyId?: string,
  ): Promise<ShiprocketAddPickupAddressResponse> {
    const got = await gotPromise;
    const token = await this.getToken(credentials, companyId);
    const url = SHIPROCKET_APIs.ADD_PICKUP;
    try {
      const res: ShiprocketAddPickupAddressResponse = await got
        .post(url, {
          json: {
            pickup_location: data.pickup_location,
            name: data.name,
            email: data.email,
            /**
             * Keep as string — Number() strips leading zeros (09876543210 → 9876543210)
             */
            phone: data.phone.toString().replace(/\D/g, ''),
            address: data.address,
            address_2: data.address_2 || '',
            city: data.city,
            state: data.state,
            country: data.country,
            pin_code: Number(data.pin_code),
          },
          headers: {
            'content-type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
          timeout: { request: SHIPROCKET_REQUEST_TIMEOUT_MS },
        })
        .json();
      return res;
    } catch (error: any) {
      const errorMsg = safeErrorBody(error);
      throw new InternalServerErrorException(
        `Shiprocket pickup location addition failed: ${errorMsg}`,
        { cause: error },
      );
    }
  }

  /**
   * Creates a reverse/return shipment in Shiprocket for an RTO scenario.
   * Uses the official ShiprocketReturnOrderPayload type — no fields hallucinated.
   */
  async createReturnOrder(
    payload: ShiprocketReturnOrderPayload,
    credentials?: { email?: string; password?: string },
    companyId?: string,
  ): Promise<ShiprocketReturnOrderResponse> {
    const got = await gotPromise;
    const cacheKey = this._buildCacheKey(credentials, companyId);
    const token = await this.getToken(credentials, companyId);
    const url = SHIPROCKET_APIs.CREATE_RETURN_ORDER;
    try {
      const res: ShiprocketReturnOrderResponse = await got
        .post(url, {
          json: payload,
          headers: {
            'content-type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
          timeout: { request: SHIPROCKET_REQUEST_TIMEOUT_MS },
        })
        .json();
      return res;
    } catch (error: any) {
      if (error?.response?.statusCode === 401) {
        await this.cacheManager.del(cacheKey);
        const freshToken = await this.getToken(credentials, companyId);
        try {
          return await got
            .post(url, {
              json: payload,
              headers: {
                'content-type': 'application/json',
                Accept: 'application/json',
                Authorization: `Bearer ${freshToken}`,
              },
              timeout: { request: SHIPROCKET_REQUEST_TIMEOUT_MS },
            })
            .json<ShiprocketReturnOrderResponse>();
        } catch {
          throw new BadGatewayException(
            'Shiprocket authentication failed after token refresh. Check your credentials.',
          );
        }
      }
      const errorMsg = safeErrorBody(error);
      throw new InternalServerErrorException(
        `Shiprocket return order creation failed: ${errorMsg}`,
        { cause: error },
      );
    }
  }

  /**
   * Schedules a pickup request for one or more shipment IDs.
   * Should be called after AWB has been successfully assigned.
   */
  async requestPickup(
    payload: ShipRocketRequestForShipmentPickup,
    credentials?: { email?: string; password?: string },
    companyId?: string,
  ): Promise<ShipRocketRequestForShipmentPickupResponse> {
    const got = await gotPromise;
    const cacheKey = this._buildCacheKey(credentials, companyId);
    const token = await this.getToken(credentials, companyId);
    const url = SHIPROCKET_APIs.REQUEST_FOR_SHIPMENT_PICKUP;
    try {
      const res: ShipRocketRequestForShipmentPickupResponse = await got
        .post(url, {
          json: payload,
          headers: {
            'content-type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
          timeout: { request: SHIPROCKET_REQUEST_TIMEOUT_MS },
        })
        .json();
      return res;
    } catch (error: any) {
      if (error?.response?.statusCode === 401) {
        await this.cacheManager.del(cacheKey);
        const freshToken = await this.getToken(credentials, companyId);
        try {
          return await got
            .post(url, {
              json: payload,
              headers: {
                'content-type': 'application/json',
                Accept: 'application/json',
                Authorization: `Bearer ${freshToken}`,
              },
              timeout: { request: SHIPROCKET_REQUEST_TIMEOUT_MS },
            })
            .json<ShipRocketRequestForShipmentPickupResponse>();
        } catch {
          throw new BadGatewayException(
            'Shiprocket authentication failed after token refresh. Check your credentials.',
          );
        }
      }
      const errorMsg = safeErrorBody(error);
      throw new InternalServerErrorException(
        `Shiprocket pickup scheduling failed: ${errorMsg}`,
        { cause: error },
      );
    }
  }

  /**
   * Cancels one or more Shiprocket shipments by their Shiprocket order IDs.
   * Note: Shiprocket's cancel endpoint takes order IDs (not shipment IDs) in the `ids` array.
   */
  async cancelShipment(
    payload: ShipRocketCancelShipmentRequest,
    credentials?: { email?: string; password?: string },
    companyId?: string,
  ): Promise<ShipRocketCancelShipmentResponse> {
    const got = await gotPromise;
    const cacheKey = this._buildCacheKey(credentials, companyId);
    const token = await this.getToken(credentials, companyId);
    const url = SHIPROCKET_APIs.CANCEL_A_SHIPMENT;
    try {
      const res: ShipRocketCancelShipmentResponse = await got
        .post(url, {
          json: payload,
          headers: {
            'content-type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
          timeout: { request: SHIPROCKET_REQUEST_TIMEOUT_MS },
        })
        .json();
      return res;
    } catch (error: any) {
      if (error?.response?.statusCode === 401) {
        await this.cacheManager.del(cacheKey);
        const freshToken = await this.getToken(credentials, companyId);
        try {
          return await got
            .post(url, {
              json: payload,
              headers: {
                'content-type': 'application/json',
                Accept: 'application/json',
                Authorization: `Bearer ${freshToken}`,
              },
              timeout: { request: SHIPROCKET_REQUEST_TIMEOUT_MS },
            })
            .json<ShipRocketCancelShipmentResponse>();
        } catch {
          throw new BadGatewayException(
            'Shiprocket authentication failed after token refresh. Check your credentials.',
          );
        }
      }
      const errorMsg = safeErrorBody(error);
      throw new InternalServerErrorException(
        `Shiprocket shipment cancellation failed: ${errorMsg}`,
        { cause: error },
      );
    }
  }

  /** Derives the Redis cache key for a given credential context */
  private _buildCacheKey(
    credentials?: { email?: string; password?: string },
    companyId?: string,
  ): string {
    /**
     * If both credentials and companyId are provided, use a composite key.
     * Otherwise, use the default key.
     */
    const isStandalone = !!(
      credentials?.email &&
      credentials?.password &&
      companyId
    );
    return isStandalone
      ? `${this.SHIPROCKET_AUTH_CACHE_KEY}:${companyId}`
      : this.SHIPROCKET_AUTH_CACHE_KEY;
  }
}
