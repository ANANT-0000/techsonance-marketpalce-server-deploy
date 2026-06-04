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
import { SkipSubscription } from './subscription.guard';

@Controller({ version: '1', path: 'subscription' })
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  // Public — used during vendor registration to show plan cards
  @Get('plans')
  @SkipSubscription()
  getPlans() {
    return this.subscriptionService.getAvailablePlans();
  }

  // Protected — vendor dashboard banner uses this
  @UseGuards(JwtAuthGuard)
  @Get('status')
  @SkipSubscription()
  getStatus(@Headers('company-domain') domain: string) {
    return this.subscriptionService.getSubscriptionStatus(domain);
  }

  // Protected — called when vendor chooses a paid plan
  @UseGuards(JwtAuthGuard)
  @Post('upgrade')
  @SkipSubscription()
  upgrade(
    @Headers('company-domain') domain: string,
    @Body() body: { plan_id: string },
  ) {
    return this.subscriptionService.upgradePlan(domain, body.plan_id);
  }

  @Post('start-trial')
  @SkipSubscription()
  startTrial(@Headers('company-domain') domain: string) {
    console.log(
      `Received request to start trial for company domain: ${domain}`,
    );
    return this.subscriptionService.startTrial(domain);
  }
}
