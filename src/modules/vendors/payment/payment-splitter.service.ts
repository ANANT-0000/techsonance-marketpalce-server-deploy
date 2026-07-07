import { Injectable, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import { DRIZZLE } from '../../../drizzle/drizzle.module.js';
import { type DrizzleDB } from '../../../drizzle/types/drizzle.js';
import { company } from '../../../drizzle/schema/index.js';
import { eq } from 'drizzle-orm';
import { VendorCryptoService } from './vendor-crypto.service.js';

@Injectable()
export class PaymentSplitterService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly configService: ConfigService,
    private readonly cryptoService: VendorCryptoService,
  ) {}

  async validateCredentials(
    keyId: string,
    keySecret: string,
  ): Promise<boolean> {
    try {
      const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
      await razorpay.orders.all({ count: 1 });
      return true;
    } catch (error) {
      return false;
    }
  }

  getRazorpayInstance(keyId: string, keySecret: string): Razorpay {
    return new Razorpay({ key_id: keyId, key_secret: keySecret });
  }

  async getSplitDetails(
    totalAmount: number,
    companyId: string,
    itemsSubtotal: number,
  ): Promise<{
    totalAmountInPaise: number;
    shippingFeeInPaise: number;
    vendorAmountInPaise: number;
  }> {
    const [companyRecord] = await this.db
      .select({
        is_free_shipping_enabled: company.is_free_shipping_enabled,
        free_delivery_threshold: company.free_delivery_threshold,
        standard_delivery_charge: company.standard_delivery_charge,
      })
      .from(company)
      .where(eq(company.id, companyId))
      .limit(1);

    let shippingCost = 0;
    if (companyRecord) {
      const isFreeShipping =
        companyRecord.is_free_shipping_enabled &&
        itemsSubtotal >= Number(companyRecord.free_delivery_threshold);
      shippingCost = isFreeShipping
        ? 0
        : Number(companyRecord.standard_delivery_charge);
    }

    const totalAmountInPaise = Math.round(totalAmount * 100);
    const shippingFeeInPaise = Math.round(shippingCost * 100);
    const vendorAmountInPaise = Math.max(
      0,
      totalAmountInPaise - shippingFeeInPaise,
    );

    return {
      totalAmountInPaise,
      shippingFeeInPaise,
      vendorAmountInPaise,
    };
  }
}
