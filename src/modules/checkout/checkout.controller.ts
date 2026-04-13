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
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { UpdateCheckoutDto } from './dto/update-checkout.dto';
import { CouponService } from '../coupon/coupon.service';
import { domainToUnicode } from 'url';

@Controller({
  version: '1',
  path: 'checkout',
})
export class CheckoutController {
  constructor(
    private readonly checkoutService: CheckoutService,
    private readonly couponService: CouponService,
  ) {}

  @Post('apply-coupon/:userId')
  applyCoupon(
    @Body('couponCode') couponCode: string,
    @Param('userId') userId: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.couponService.verifyCoupon(couponCode, userId, domain);
  }
  // @Post()
  // create(@Body() createCheckoutDto: CreateCheckoutDto) {
  //   return this.checkoutService.create(createCheckoutDto);
  // }

  // @Get()
  // findAll() {
  //   return this.checkoutService.findAll();
  // }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.checkoutService.findOne(+id);
  // }

  // @Patch(':id')
  // update(@Param('id') id: string, @Body() updateCheckoutDto: UpdateCheckoutDto) {
  //   return this.checkoutService.update(+id, updateCheckoutDto);
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.checkoutService.remove(+id);
  // }
}
