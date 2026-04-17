import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Headers,
} from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { InitiateCheckoutDto, VerifyCheckoutDto } from './dto/checkout.dto';

import { CouponService } from '../coupon/coupon.service';

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
  verifyCheckout(
    @Body() verifyCheckoutDto: VerifyCheckoutDto,
    @Headers('company-domain') domain: string,
  ) {
    console.log("verifyCheckoutDto", verifyCheckoutDto);
    return this.checkoutService.verifyCheckout(verifyCheckoutDto, domain);
  }

  @Post('apply-coupon/:userId')
  applyCoupon(
    @Body('couponCode') couponCode: string,
    @Param('userId') userId: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.couponService.verifyCoupon(couponCode, userId, domain);
  }
}
