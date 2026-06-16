import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SkipSubscription } from '../../common/decorators/skip-subscription.decorator';
import { Public } from '../../common/decorators/public.decorator';

@Controller({ version: '1', path: 'subscription' })
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) { }

  // Public — used during vendor registration to show plan cards
  @Public()
  @Get('plans')
  @SkipSubscription()
  getPlans() {
    return this.subscriptionService.getAvailablePlans();
  }

  // Protected — vendor dashboard banner uses this
  @UseGuards(JwtAuthGuard)
  @Get('status')
  @HttpCode(HttpStatus.OK)
  @SkipSubscription()
  getStatus(@Headers('company-domain') domain: string) {
    return this.subscriptionService.getSubscriptionStatus(domain);
  }

  // Protected — called when vendor chooses a paid plan
  @UseGuards(JwtAuthGuard)
  @Post('upgrade')
  @HttpCode(HttpStatus.OK)
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
    return this.subscriptionService.startTrial(domain);
  }
}
