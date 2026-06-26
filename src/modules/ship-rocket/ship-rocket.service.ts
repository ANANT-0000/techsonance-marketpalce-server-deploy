import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import got from 'got';
import { IShippingProvider } from '../shipping/interfaces/shipping-provider.interface';
import { SHIPROCKET_URLS } from './constants/ship-rocket.constants';
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
} from '../../common/Types/shiprocket';

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
export class ShipRocketService implements IShippingProvider {
  private readonly SHIPROCKET_AUTH_CACHE_KEY = 'shiprocket_auth_cache';
  constructor(
    private configService: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async getServiceability(
    data: {
      pickup_pincode: string;
      delivery_pincode: string;
      breadth: number;
      height: number;
      weight: number;
      qc_check: 0 | 1;
      is_return: 0 | 1;
      mode: string;
      cod: 0 | 1;
    },
    credentials?: { email?: string; password?: string },
    companyId?: string,
  ) {
    const token = await this.getToken(credentials, companyId);
    const url = SHIPROCKET_URLS.SERVICEABILITY;
    const res = await got
      .post(url, {
        searchParams: {
          pickup_pincode: data.pickup_pincode,
          delivery_pincode: data.delivery_pincode,
          breadth: data.breadth,
          height: data.height,
          weight: data.weight,
          qc_check: data.qc_check,
          is_return: data.is_return,
          mode: data.mode,
          cod: data.cod,
        },
        headers: { Authorization: `Bearer ${token}` },
        timeout: { request: SHIPROCKET_REQUEST_TIMEOUT_MS },
      })
      .json();
    return res;
  }

  async createDraftOrder(
    payload: ShiprocketCreateOrderPayload,
    credentials?: { email?: string; password?: string },
    companyId?: string,
  ): Promise<ShiprocketCreateOrderResponse> {
    const cacheKey = this._buildCacheKey(credentials, companyId);
    const token = await this.getToken(credentials, companyId);
    const url = SHIPROCKET_URLS.CREATE_ORDER;
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
          throw new UnauthorizedException(
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

  async generateAWB(
    shipmentId: number,
    courierId?: number,
    credentials?: { email?: string; password?: string },
    companyId?: string,
  ): Promise<ShiprocketGenerateAWBforShipmentResponse> {
    const cacheKey = this._buildCacheKey(credentials, companyId);
    const token = await this.getToken(credentials, companyId);
    const url = SHIPROCKET_URLS.ASSIGN_AWB;
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
          throw new UnauthorizedException(
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

    // 1. Fast path: token already in Redis cache
    const cachedToken: any = await this.cacheManager.get(cacheKey);
    if (cachedToken) {
      return typeof cachedToken === 'string' ? cachedToken : cachedToken.token;
    }

    // 2. Stampede guard: if another request is already fetching this token,
    //    share its promise instead of firing a second /auth/login call.
    const existing = tokenFetchInFlight.get(cacheKey);
    if (existing) {
      const tokenResponse = await existing;
      return tokenResponse.token;
    }

    // 3. This request wins the race — fetch the token and share the promise.
    const fetchPromise = this.fetchToken(
      credentials?.email,
      credentials?.password,
    );
    tokenFetchInFlight.set(cacheKey, fetchPromise);

    try {
      const tokenResponse = await fetchPromise;
      const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
      await this.cacheManager.set(cacheKey, tokenResponse, sevenDaysInMs);
      return tokenResponse.token;
    } finally {
      // Always clean up the in-flight map so future requests use the cache
      tokenFetchInFlight.delete(cacheKey);
    }
  }

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
    const loginEmail =
      email || this.configService.get<string>('SHIP_ROCKET_EMAIL');
    const loginPassword =
      password || this.configService.get<string>('SHIP_ROCKET_PASSWORD');
    // Remove clean quotes if present in env strings
    const cleanedEmail = loginEmail?.replace(/['"]/g, '').trim();
    const cleanedPassword = loginPassword?.replace(/['"]/g, '').trim();

    const url = SHIPROCKET_URLS.LOGIN;
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
      throw new InternalServerErrorException(
        `Shiprocket authentication failed: ${errorBody}`,
        { cause: error },
      );
    }
  }

  async addPickupLocation(
    data: ShiprocketAddPickupAddress,
    credentials?: { email?: string; password?: string },
    companyId?: string,
  ): Promise<ShiprocketAddPickupAddressResponse> {
    const token = await this.getToken(credentials, companyId);
    const url = SHIPROCKET_URLS.SHIP_ROCKET_ADD_PICKUP;
    try {
      const res: ShiprocketAddPickupAddressResponse = await got
        .post(url, {
          json: {
            pickup_location: data.pickup_location,
            name: data.name,
            email: data.email,
            // Keep as string — Number() strips leading zeros (09876543210 → 9876543210)
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
    const cacheKey = this._buildCacheKey(credentials, companyId);
    const token = await this.getToken(credentials, companyId);
    const url = SHIPROCKET_URLS.CREATE_RETURN_ORDER;
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
          throw new UnauthorizedException(
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
    const cacheKey = this._buildCacheKey(credentials, companyId);
    const token = await this.getToken(credentials, companyId);
    const url = SHIPROCKET_URLS.SHIP_ROCKET_REQUEST_FOR_SHIPMENT_PICKUP;
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
          throw new UnauthorizedException(
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
    const cacheKey = this._buildCacheKey(credentials, companyId);
    const token = await this.getToken(credentials, companyId);
    const url = SHIPROCKET_URLS.SHIP_ROCKET_CANCEL_A_SHIPMENT_API;
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
          throw new UnauthorizedException(
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
