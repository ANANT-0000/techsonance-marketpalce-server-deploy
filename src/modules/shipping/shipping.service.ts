import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import { CompanyService } from '../company/company.service';
import { and, eq } from 'drizzle-orm';
import { company, orders, shipping_details } from '../../drizzle/schema';
import { MailService } from '../../common/services/mail/mail.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { ShippingErrorKeyEnum } from './constants/shipping.enums';
import { CryptoService } from './crypto.service';
import {
  SHIPPING_ITEM_FALLBACK_NAME,
  SHIPPING_COMPANY_NOT_FOUND_MSG,
  SHIPPING_SETTINGS_UPDATED_MSG,
  SHIPPING_API_KEY_PLACEHOLDER,
} from './constants/shipping.constants';

@Injectable()
export class ShippingService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
    private readonly mailService: MailService,
    private readonly cryptoService: CryptoService,
  ) {}
  async addTrackingUrl(orderId: string, trackingUrl: string, domain: string) {
    const filteredDomain = domainExtractor(domain);
    const companyId = await this.companyService.find(filteredDomain);
    if (!companyId) {
      throw new HttpException(
        `Company with domain ${domain} not found`,
        HttpStatus.NOT_FOUND,
      );
    }
    try {
      const [isOrderValid] = await this.db
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.company_id, companyId)))
        .limit(1);
      if (!isOrderValid || !isOrderValid.id) {
        throw new HttpException(ShippingErrorKeyEnum.ORDER_NOT_FOUND, HttpStatus.NOT_FOUND);
      }
      await this.db
        .insert(shipping_details)
        .values({
          order_id: orderId,
          company_id: companyId,
          tracking_url: trackingUrl,
        })
        .catch((error) => {
          throw new HttpException(
            ShippingErrorKeyEnum.FAILED_TO_UPDATE_TRACKING_URL,
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        });
      const orderDetail = await this.db.query.orders.findFirst({
        where: eq(orders.id, orderId),
        with: {
          customer: true,
          items: {
            with: {
              variant: {
                columns: {
                  variant_name: true,
                },
              },
            },
          },
        },
      });

      if (!orderDetail?.customer) {
        throw new HttpException(ShippingErrorKeyEnum.ORDER_NOT_FOUND, HttpStatus.NOT_FOUND);
      }
      const firstItem = orderDetail.items[0];
      const productName = firstItem?.variant?.variant_name || SHIPPING_ITEM_FALLBACK_NAME;
      const itemName =
        orderDetail.items.length > 1
          ? `${productName} +${orderDetail.items.length - 1} more items`
          : productName;
      await this.mailService.sendOrderShippedEmail(
        orderDetail?.customer?.email,
        `${orderDetail?.customer?.first_name} ${orderDetail?.customer?.last_name}`,
        orderDetail.id,
        trackingUrl,
        itemName,
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        ShippingErrorKeyEnum.ERROR_OCCURRED_WHILE_FETCHING_ORDER,
        {
          cause: error,
        },
      );
    }
  }
  async updateTrackingUrl(
    orderId: string,
    trackingUrl: string,
    domain: string,
  ) {
    const filteredDomain = domainExtractor(domain);
    const companyId = await this.companyService.find(filteredDomain);
    if (!companyId) {
      throw new HttpException(
        `Company with domain ${domain} not found`,
        HttpStatus.NOT_FOUND,
      );
    }
    try {
      const [isOrderValid] = await this.db
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.company_id, companyId)))
        .limit(1);
      if (!isOrderValid || !isOrderValid.id) {
        throw new HttpException(ShippingErrorKeyEnum.ORDER_NOT_FOUND, HttpStatus.NOT_FOUND);
      }
      const [existingShipping] = await this.db
        .select({ id: shipping_details.id })
        .from(shipping_details)
        .where(
          and(
            eq(shipping_details.order_id, orderId),
            eq(shipping_details.company_id, companyId),
          ),
        )
        .limit(1);
      if (!existingShipping || !existingShipping.id) {
        throw new HttpException(
          ShippingErrorKeyEnum.SHIPPING_DETAILS_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }

      await this.db
        .update(shipping_details)
        .set({ tracking_url: trackingUrl })
        .where(
          and(
            eq(shipping_details.order_id, orderId),
            eq(shipping_details.company_id, companyId),
          ),
        )
        .catch((error) => {
          throw new HttpException(
            ShippingErrorKeyEnum.FAILED_TO_UPDATE_TRACKING_URL,
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        ShippingErrorKeyEnum.ERROR_OCCURRED_WHILE_FETCHING_TRACKING_INFORMATION,
        {
          cause: error,
        },
      );
    }
  }

  async getShippingSettings(domain: string) {
    const filteredDomain = domainExtractor(domain);
    const companyId = await this.companyService.find(filteredDomain);
    if (!companyId) {
      throw new HttpException(
        `Company with domain ${domain} not found`,
        HttpStatus.NOT_FOUND,
      );
    }
    const comp = await this.db.query.company.findFirst({
      where: eq(company.id, companyId),
      columns: {
        logistics_mode: true,
        logistics_pickup_id: true,
        is_free_shipping_enabled: true,
        free_delivery_threshold: true,
        standard_delivery_charge: true,
        encrypted_logistics_api_key: true,
        encrypted_logistics_api_secret: true,
      },
    });

    if (!comp) {
      throw new HttpException(SHIPPING_COMPANY_NOT_FOUND_MSG, HttpStatus.NOT_FOUND);
    }

    return {
      logistics_mode: comp.logistics_mode,
      logistics_pickup_id: comp.logistics_pickup_id,
      is_free_shipping_enabled: comp.is_free_shipping_enabled,
      free_delivery_threshold: comp.free_delivery_threshold,
      standard_delivery_charge: comp.standard_delivery_charge,
      has_api_key: !!comp.encrypted_logistics_api_key,
      has_api_secret: !!comp.encrypted_logistics_api_secret,
    };
  }

  async updateShippingSettings(domain: string, payload: any) {
    const filteredDomain = domainExtractor(domain);
    const companyId = await this.companyService.find(filteredDomain);
    if (!companyId) {
      throw new HttpException(
        `Company with domain ${domain} not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    const updateFields: any = {};

    if (payload.logistics_mode !== undefined) {
      updateFields.logistics_mode = payload.logistics_mode;
    }
    if (payload.logistics_pickup_id !== undefined) {
      updateFields.logistics_pickup_id = payload.logistics_pickup_id;
    }
    if (payload.is_free_shipping_enabled !== undefined) {
      updateFields.is_free_shipping_enabled = payload.is_free_shipping_enabled;
    }
    if (payload.free_delivery_threshold !== undefined) {
      updateFields.free_delivery_threshold = payload.free_delivery_threshold;
    }
    if (payload.standard_delivery_charge !== undefined) {
      updateFields.standard_delivery_charge = payload.standard_delivery_charge;
    }

    if (payload.logistics_api_key) {
      if (payload.logistics_api_key !== SHIPPING_API_KEY_PLACEHOLDER) {
        updateFields.encrypted_logistics_api_key = this.cryptoService.encrypt(payload.logistics_api_key);
      }
    } else if (payload.logistics_api_key === '') {
      updateFields.encrypted_logistics_api_key = null;
    }

    if (payload.logistics_api_secret) {
      if (payload.logistics_api_secret !== SHIPPING_API_KEY_PLACEHOLDER) {
        updateFields.encrypted_logistics_api_secret = this.cryptoService.encrypt(payload.logistics_api_secret);
      }
    } else if (payload.logistics_api_secret === '') {
      updateFields.encrypted_logistics_api_secret = null;
    }

    await this.db
      .update(company)
      .set(updateFields)
      .where(eq(company.id, companyId));

    return { success: true, message: SHIPPING_SETTINGS_UPDATED_MSG };
  }
}
