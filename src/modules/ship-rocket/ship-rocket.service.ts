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

@Injectable()
export class ShipRocketService {
  private readonly SHIPROCKET_AUTH_CACHE_KEY = 'shiprocket_auth_cache';
  constructor(
    private configService: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async getServiceability(data: {
    pickup_pincode: string;
    delivery_pincode: string;
    breadth: number;
    height: number;
    weight: number;
    qc_check: 0 | 1;
    is_return: 0 | 1;
    mode: string;
    cod: 0 | 1;
  }) {
    const token = (await this.getToken()).token;
    const url = this.configService.get<string>(
      'SHIP_ROCKET_SERVICEABILITY_API',
    );
    if (!url) throw new HttpException('URL Not Found', HttpStatus.BAD_REQUEST);
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
  async getToken(): Promise<{
    company_id: number;
    created_at: string;
    email: string;
    first_name: string;
    id: number;
    last_name: string;
    token: string;
  }> {
    let shipRocketAuthResponse:
      | {
          company_id: number;
          created_at: string;
          email: string;
          first_name: string;
          id: number;
          last_name: string;
          token: string;
        }
      | undefined = await this.cacheManager.get(this.SHIPROCKET_AUTH_CACHE_KEY);
    if (shipRocketAuthResponse) return shipRocketAuthResponse;
    shipRocketAuthResponse = await this.fetchToken();
    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
    await this.cacheManager.set(
      this.SHIPROCKET_AUTH_CACHE_KEY,
      shipRocketAuthResponse,
      sevenDaysInMs,
    );
    return shipRocketAuthResponse;
  }
  async fetchToken(): Promise<{
    company_id: number;
    created_at: string;
    email: string;
    first_name: string;
    id: number;
    last_name: string;
    token: string;
  }> {
    const email = this.configService.get<string>('SHIP_ROCKET_EMAIL');
    const password = this.configService.get<string>('SHIP_ROCKET_PASSWORD');
    const url = this.configService.get<string>('SHIP_ROCKET_LOGIN_API');
    try {
      if (!url)
        throw new HttpException('URL Not Found', HttpStatus.BAD_REQUEST);
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
            email,
            password,
          },
          headers: {
            'content-type': 'application/json',
            Accept: 'application/json',
          },
        })
        .json();

      return res;
    } catch (error) {
      throw new InternalServerErrorException('Something went wrong', {
        cause: error,
      });
    }
  }
}
