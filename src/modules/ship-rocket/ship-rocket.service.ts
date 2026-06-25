import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import got from 'got';
import { IShippingProvider } from '../shipping/interfaces/shipping-provider.interface';
import { SHIPROCKET_URLS } from './constants/ship-rocket.constants';
import {
  ShiprocketCreateOrderPayload,
  ShiprocketCreateOrderResponse,
  ShiprocketGenerateAWBforShipmentResponse,
} from 'src/common/Types/shiprocket';

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
      })
      .json();
    return res;
  }

  async createDraftOrder(
    payload: ShiprocketCreateOrderPayload,
    credentials?: { email?: string; password?: string },
    companyId?: string,
  ): Promise<ShiprocketCreateOrderResponse> {
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
        })
        .json();
      return res;
    } catch (error: any) {
      const errorMsg = error?.response?.body
        ? JSON.stringify(error.response.body)
        : error.message;
      throw new InternalServerErrorException(
        `Shiprocket draft order creation failed: ${errorMsg}`,
        {
          cause: error,
        },
      );
    }
  }

  async generateAWB(
    shipmentId: number,
    courierId?: number,
    credentials?: { email?: string; password?: string },
    companyId?: string,
  ): Promise<ShiprocketGenerateAWBforShipmentResponse> {
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
        })
        .json();
      return res;
    } catch (error: any) {
      const errorMsg = error?.response?.body
        ? JSON.stringify(error.response.body)
        : error.message;
      throw new InternalServerErrorException(
        `Shiprocket AWB generation failed: ${errorMsg}`,
        {
          cause: error,
        },
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

    let cachedToken: any = await this.cacheManager.get(cacheKey);
    if (cachedToken) {
      return typeof cachedToken === 'string' ? cachedToken : cachedToken.token;
    }

    const tokenResponse = await this.fetchToken(
      credentials?.email,
      credentials?.password,
    );
    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
    await this.cacheManager.set(cacheKey, tokenResponse, sevenDaysInMs);
    return tokenResponse.token;
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
        })
        .json();

      return res;
    } catch (error: any) {
      const errorBody = error?.response?.body
        ? JSON.stringify(error.response.body)
        : error.message;
      throw new InternalServerErrorException(
        `Shiprocket authentication failed: ${errorBody}`,
        {
          cause: error,
        },
      );
    }
  }

  async addPickupLocation(
    data: {
      pickup_location: string;
      name: string;
      email: string;
      phone: string;
      address: string;
      address_2?: string;
      city: string;
      state: string;
      country: string;
      pin_code: string;
    },
    credentials?: { email?: string; password?: string },
    companyId?: string,
  ) {
    const token = await this.getToken(credentials, companyId);
    const url = SHIPROCKET_URLS.ADD_PICKUP;
    try {
      const res = await got
        .post(url, {
          json: {
            pickup_location: data.pickup_location,
            name: data.name,
            email: data.email,
            phone: Number(data.phone.replace(/\D/g, '')),
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
        })
        .json();
      return res;
    } catch (error: any) {
      const errorMsg = error?.response?.body
        ? JSON.stringify(error.response.body)
        : error.message;
      throw new InternalServerErrorException(
        `Shiprocket pickup location addition failed: ${errorMsg}`,
        { cause: error },
      );
    }
  }
}
