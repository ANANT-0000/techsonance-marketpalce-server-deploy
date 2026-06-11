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
import { orders, shipping_details } from '../../drizzle/schema';
import { MailService } from '../../common/services/mail/mail.service';
import { domainExtractor } from '../../common/filters/domainExtractor.filter';
import { ShippingErrorKeyEnum } from './constants/shipping.enums';

@Injectable()
export class ShippingService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
    private readonly mailService: MailService,
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
      if (!isOrderValid.id) {
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
      const productName = firstItem?.variant?.variant_name || 'Item';
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
      if (!isOrderValid.id) {
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
      if (!existingShipping.id) {
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
}
