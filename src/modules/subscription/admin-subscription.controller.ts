import { Controller, Get, Post, Body, Param, Put, UseGuards, ValidationPipe, Headers } from '@nestjs/common';
import { CmsSubscriptionService } from './cms-subscription.service.js';
import { PlanPayloadDto } from './dto/plan.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

// Note: Ensure Roles guard is applied in your real setup
// @Roles('BillingAdmin') 
@UseGuards(JwtAuthGuard)
@Controller({ version: '1', path: 'admin/subscription-plans' })
export class AdminSubscriptionController {
  constructor(private readonly cmsSubscriptionService: CmsSubscriptionService) {}

  @Get()
  getPlans() {
    return this.cmsSubscriptionService.getAdminPlans();
  }

  @Put(':planKey/draft')
  updateDraft(
    @Param('planKey') planKey: string,
    @Body(new ValidationPipe({ transform: true })) payload: PlanPayloadDto,
    @Headers('user-id') adminId: string, // Get from Auth user in reality
  ) {
    // For demo, we are mocking adminId from header or default
    return this.cmsSubscriptionService.updateDraft(planKey, payload, adminId || 'admin-user-id');
  }

  @Post(':planKey/publish')
  publishDraft(
    @Param('planKey') planKey: string,
    @Headers('user-id') adminId: string,
  ) {
    return this.cmsSubscriptionService.publishDraft(planKey, adminId || 'admin-user-id');
  }
}
