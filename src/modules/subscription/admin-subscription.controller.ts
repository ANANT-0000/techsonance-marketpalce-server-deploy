import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  UseGuards,
  ValidationPipe,
  Req,
} from '@nestjs/common';
import { CmsSubscriptionService } from './cms-subscription.service.js';
import { PlanPayloadDto } from './dto/plan.dto.js';
import { UpdateVendorSubscriptionDto } from './dto/update-vendor-subscription.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../enums/role.enum.js';
import { RoleGuard } from '../../guards/role.guard.js';

@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(Role.ADMIN)
@Controller({ version: '1', path: 'admin/subscription-plans' })
export class AdminSubscriptionController {
  constructor(
    private readonly cmsSubscriptionService: CmsSubscriptionService,
  ) {}

  @Get()
  getPlans() {
    return this.cmsSubscriptionService.getAdminPlans();
  }

  @Post()
  createPlan(
    @Body('planKey') planKey: string,
    @Req() req: any,
  ) {
    return this.cmsSubscriptionService.createPlan(planKey, req.user.id);
  }

  @Put(':planKey/draft')
  updateDraft(
    @Param('planKey') planKey: string,
    @Body(new ValidationPipe({ transform: true })) payload: PlanPayloadDto,
    @Req() req: any,
  ) {
    return this.cmsSubscriptionService.updateDraft(planKey, payload, req.user.id);
  }

  @Post(':planKey/publish')
  publishDraft(
    @Param('planKey') planKey: string,
    @Req() req: any,
  ) {
    return this.cmsSubscriptionService.publishDraft(planKey, req.user.id);
  }

  @Get('vendors')
  getVendorSubscriptions() {
    return this.cmsSubscriptionService.getAdminSubscriptions();
  }

  @Get('live-plans')
  getLiveSubscriptionPlans() {
    return this.cmsSubscriptionService.getLiveSubscriptionPlans();
  }

  @Put('vendors/:id')
  updateVendorSubscription(
    @Param('id') subscriptionId: string,
    @Body(new ValidationPipe({ transform: true })) payload: UpdateVendorSubscriptionDto,
  ) {
    return this.cmsSubscriptionService.updateVendorSubscription(subscriptionId, payload);
  }
}
