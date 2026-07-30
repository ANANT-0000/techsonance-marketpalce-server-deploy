import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Headers,
  HttpCode,
  HttpStatus,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { SkipSubscription } from '../../common/decorators/skip-subscription.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';

@Controller({ version: '1', path: 'subscription' })
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  // Public — used during vendor registration and CMS editor to show plan cards
  @Public()
  @Get('plans')
  @SkipSubscription()
  getPlans(@Headers('company-domain') domain: string) {
    return this.subscriptionService.getAvailablePlans(domain || undefined);
  }

  // Protected — vendor dashboard banner uses this
  @UseGuards(JwtAuthGuard)
  @Get('status')
  @HttpCode(HttpStatus.OK)
  @SkipSubscription()
  getStatus(@Headers('company-domain') domain: string, @Req() req: any) {
    if (domain && domain !== req.user?.company_id) {
      throw new ForbiddenException('Invalid company domain');
    }
    return this.subscriptionService.getSubscriptionStatus(
      req.user?.company_id,
    );
  }

  // Protected — called when vendor chooses a paid plan
  @UseGuards(JwtAuthGuard)
  @Post('upgrade')
  @HttpCode(HttpStatus.OK)
  @SkipSubscription()
  upgrade(
    @Headers('company-domain') domain: string,
    @Body() body: { plan_id: string },
    @Req() req: any,
  ) {
    if (domain && domain !== req.user?.company_id) {
      throw new ForbiddenException('Invalid company domain');
    }
    return this.subscriptionService.upgradePlan(
      req.user?.company_id,
      body.plan_id,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('start-trial')
  @SkipSubscription()
  startTrial(
    @Headers('company-domain') domain: string,
    @Body() body: { plan_id?: string },
    @Req() req: any,
  ) {
    if (domain && domain !== req.user?.company_id) {
      throw new ForbiddenException('Invalid company domain');
    }
    return this.subscriptionService.startTrial(
      req.user?.company_id,
      body?.plan_id,
    );
  }
}
