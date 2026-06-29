import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Headers,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { InitiateCheckoutDto, VerifyCheckoutDto } from './dto/checkout.dto';
import { CouponService } from '../coupon/coupon.service';
import { Public } from '../../common/decorators/public.decorator';
import {
  RazorpayOrderPaidWebhook,
  RazorpayWebhookEvent,
} from './constants/razorpay.webhook';

@Controller({
  version: '1',
  path: 'checkout',
})
export class CheckoutController {
  constructor(
    private readonly checkoutService: CheckoutService,
    private readonly couponService: CouponService,
  ) {}

  @Post(':userId/initiate')
  async initiateCheckout(
    @Param('userId') userId: string,
    @Body() initiateCheckoutDto: InitiateCheckoutDto,
    @Headers('company-domain') domain: string,
  ) {
    return this.checkoutService.initiateCheckout(
      userId,
      initiateCheckoutDto,
      domain,
    );
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  verifyCheckout(
    @Body() verifyCheckoutDto: VerifyCheckoutDto,
    @Headers('company-domain') domain: string,
  ) {
    return this.checkoutService.verifyCheckout(verifyCheckoutDto, domain);
  }

  @Public()
  @Post('razorpay-webhook')
  @HttpCode(HttpStatus.OK)
  async handleRazorpayWebhook(
    @Req() req: any,
    @Headers('x-razorpay-signature') signature: string,
  ) {
    const rawBody: string = req.rawBody
      ? req.rawBody.toString('utf8')
      : '';
    return this.checkoutService.handleRazorpayWebhook(rawBody, signature);
  }

  @Post('apply-coupon/:userId')
  @HttpCode(HttpStatus.OK)
  applyCoupon(
    @Body('couponCode') couponCode: string,
    @Param('userId') userId: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.couponService.verifyCoupon(couponCode, userId, domain);
  }

  @Post('calculate-shipping/:userId')
  @HttpCode(HttpStatus.OK)
  async calculateShippingRate(
    @Param('userId') userId: string,
    @Body()
    dto: {
      addressId: string;
      cartId?: string;
      productVariantId?: string;
      qty?: number;
    },
    @Headers('company-domain') domain: string,
  ) {
    return this.checkoutService.calculateShippingRate(userId, dto, domain);
  }
}
