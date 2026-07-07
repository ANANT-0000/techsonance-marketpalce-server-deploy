import { Controller, Get } from '@nestjs/common';
import { CmsSubscriptionService } from './cms-subscription.service.js';
import { SkipSubscription } from '../../common/decorators/skip-subscription.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';

@Controller({ version: '1', path: 'public/subscription-plans' })
export class PublicSubscriptionController {
  constructor(private readonly cmsSubscriptionService: CmsSubscriptionService) {}

  @Public()
  @SkipSubscription()
  @Get()
  getLivePlans() {
    return this.cmsSubscriptionService.getPublicPlans();
  }
}
