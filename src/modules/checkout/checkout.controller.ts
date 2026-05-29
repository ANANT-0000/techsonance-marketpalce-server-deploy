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
  @HttpCode(HttpStatus.OK)
  verifyCheckout(
    @Body() verifyCheckoutDto: VerifyCheckoutDto,
    @Headers('company-domain') domain: string,
  ) {
    return this.checkoutService.verifyCheckout(verifyCheckoutDto, domain);
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
}
