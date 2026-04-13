import { Inject, Injectable } from '@nestjs/common';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { UpdateCheckoutDto } from './dto/update-checkout.dto';
import { type DrizzleDB } from 'src/drizzle/types/drizzle';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

@Injectable()
export class CheckoutService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}
  async initiateCheckout(createCheckoutDto: CreateCheckoutDto) {}
}
