import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { DRIZZLE, type DrizzleService } from 'src/drizzle/drizzle.module';
import { CompanyService } from '../company/company.service';
import { and, eq } from 'drizzle-orm';
import { orders, shipping_details } from 'src/drizzle/schema';
import { MailService } from 'src/common/services/mail/mail.service';

@Injectable()
export class ShippingService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService,
    private readonly companyService: CompanyService,
    private readonly mailService: MailService,
  ) { }
  async addTrackingUrl(orderId: string, trackingUrl: string, domain: string) {
    console.log('adding tracking Url');
    const companyId = await this.companyService.find(domain);
    console.log(companyId);
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
        throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
      }
      await this.db
        .insert(shipping_details)
        .values({
          order_id: orderId,
          company_id: companyId,
          tracking_url: trackingUrl,
        })
        .catch((error) => {
          console.error('Error updating tracking URL:', error);
          throw new HttpException(
            'Failed to update tracking URL',
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
        throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
      }
      const firstItem = orderDetail.items[0];
      const productName = firstItem?.variant?.variant_name || 'Item';
      const itemName = orderDetail.items.length > 1 ? `${productName} +${orderDetail.items.length - 1} more items` : productName;
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
        'Error occurred while fetching order',
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
    const companyId = await this.companyService.find(domain);
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
        throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
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
          'Shipping details not found',
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
          console.error('Error updating tracking URL:', error);
          throw new HttpException(
            'Failed to update tracking URL',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Error occurred while fetching tracking information',
        {
          cause: error,
        },
      );
    }
  }
}
