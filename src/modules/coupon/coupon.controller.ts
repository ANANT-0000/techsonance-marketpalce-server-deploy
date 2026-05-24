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
import { CouponService } from './coupon.service';
import { CreateCouponDto, UpdateCouponDto } from './dto/coupon.dto';

@Controller({ version: '1', path: 'coupon' })
export class CouponController {
  constructor(private readonly couponService: CouponService) {}

  @Post('/:userId')
  create(
    @Body() createCouponDto: CreateCouponDto,
    @Headers('company-domain') domain: string,
    @Param('userId') userId: string, // Required for promotion 'created_by'
  ) {
    return this.couponService.create(createCouponDto, domain, userId);
  }

  @Get()
  findAll(@Headers('company-domain') domain: string) {
    return this.couponService.findAll(domain);
  }

  @Get('product/:id')
  findCoupons(
    @Headers('company-domain') domain: string,
    @Param('id') productId: string,
  ) {
    return this.couponService.findCoupons(domain, productId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Headers('company-domain') domain: string) {
    return this.couponService.findOne(id, domain);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateCouponDto: UpdateCouponDto,
    @Headers('company-domain') domain: string,
  ) {
    return this.couponService.update(id, updateCouponDto, domain);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Headers('company-domain') domain: string) {
    return this.couponService.remove(id, domain);
  }

  @Post('verify/:userId')
  verify(
    @Param('userId') userId: string,
    @Body('code') code: string,
    @Headers('company-domain') domain: string,
  ) {
    return this.couponService.verifyCoupon(code, userId, domain);
  }

  @Post('validate')
  async validateCoupon(
    @Body()
    body: {
      userId: string;
      code: string;
      cartTotal: number;
      productIds: string[];
    },
  ) {
    return await this.couponService.validateAppliedCoupon(
      body.userId,
      body.code,
      body.cartTotal,
      body.productIds,
    );
  }
}
