import { PartialType } from '@nestjs/swagger';
import { CreateCouponDto } from './coupon.dto';

export class UpdateCouponDto extends PartialType(CreateCouponDto) {}
