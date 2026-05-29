import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,

  Headers,
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller({ version: '1', path: 'subscription' })
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  // Public — used during vendor registration to show plan cards
  @Get('plans')
  getPlans() {
    return this.subscriptionService.getAvailablePlans();
  }

  // Protected — vendor dashboard banner uses this
  @UseGuards(JwtAuthGuard)
  @Get('status')
  getStatus(@Headers('company-domain') domain: string) {
    return this.subscriptionService.getSubscriptionStatus(domain);
  }

  // Protected — called when vendor chooses a paid plan
  @UseGuards(JwtAuthGuard)
  @Post('upgrade')
  upgrade(
    @Headers('company-domain') domain: string,
    @Body() body: { plan_id: string },
  ) {
    return this.subscriptionService.upgradePlan(domain, body.plan_id);
  }
}
