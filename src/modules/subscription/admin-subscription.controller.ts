import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  UseGuards,
  ValidationPipe,
  Req,
} from '@nestjs/common';
import { CmsSubscriptionService } from './cms-subscription.service.js';
import { PlanPayloadDto } from './dto/plan.dto.js';
import { UpdateVendorSubscriptionDto } from './dto/update-vendor-subscription.dto.js';
import { UpdateFeatureLimitDto } from './dto/update-feature-limit.dto.js';
import { CreateFeatureDefinitionDto } from './dto/create-feature-definition.dto.js';
import { UpdateFeatureDefinitionDto } from './dto/update-feature-definition.dto.js';
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

  @Post(':planKey/unpublish')
  unpublishPlan(
    @Param('planKey') planKey: string,
    @Req() req: any,
  ) {
    return this.cmsSubscriptionService.unpublishPlan(planKey, req.user.id);
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

  @Get(':planKey/feature-limits')
  getPlanFeatureLimits(
    @Param('planKey') planKey: string,
  ) {
    return this.cmsSubscriptionService.getPlanFeatureLimits(planKey);
  }

  @Put(':planKey/feature-limits/:featureId')
  updatePlanFeatureLimit(
    @Param('planKey') planKey: string,
    @Param('featureId') featureId: string,
    @Body(new ValidationPipe({ transform: true })) payload: UpdateFeatureLimitDto,
  ) {
    return this.cmsSubscriptionService.updatePlanFeatureLimit(planKey, featureId, payload);
  }

  @Get('feature-definitions')
  getFeatureDefinitions() {
    return this.cmsSubscriptionService.getFeatureDefinitions();
  }

  @Post('feature-definitions')
  createFeatureDefinition(
    @Body(new ValidationPipe({ transform: true })) payload: CreateFeatureDefinitionDto,
  ) {
    return this.cmsSubscriptionService.createFeatureDefinition(payload);
  }

  @Put('feature-definitions/:id')
  updateFeatureDefinition(
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true })) payload: UpdateFeatureDefinitionDto,
  ) {
    return this.cmsSubscriptionService.updateFeatureDefinition(id, payload);
  }

  @Delete('feature-definitions/:id')
  deleteFeatureDefinition(
    @Param('id') id: string,
  ) {
    return this.cmsSubscriptionService.deleteFeatureDefinition(id);
  }
}
