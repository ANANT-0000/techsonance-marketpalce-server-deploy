import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RoleGuard } from '../../guards/role.guard.js';
import { EntitlementResolverService } from './entitlement-resolver.service.js';
import { UsageTrackerService } from './usage-tracker.service.js';

@Controller('entitlements')
export class EntitlementsController {
  constructor(
    private readonly resolver: EntitlementResolverService,
    private readonly tracker: UsageTrackerService,
  ) {}

  /**
   * Vendor-facing: current company's full entitlement + usage snapshot.
   * Used by the vendor dashboard "Plan Usage" widget.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMyEntitlements(@Query('companyId') companyId: string) {
    const map = await this.resolver.resolve(companyId);
    return map.toJSON();
  }

  @Get(':companyId/usage/:featureKey')
  @UseGuards(JwtAuthGuard)
  async getUsage(@Param('companyId') companyId: string, @Param('featureKey') featureKey: string) {
    const used = await this.tracker.getCurrentUsage(companyId, featureKey);
    return { companyId, featureKey, used };
  }

  /** Admin-only: force-refresh a company's entitlement cache after a manual plan override. */
  @Get('admin/:companyId/invalidate-cache')
  @UseGuards(JwtAuthGuard, RoleGuard)
  async invalidateCache(@Param('companyId') companyId: string) {
    await this.resolver.invalidate(companyId);
    return { companyId, invalidated: true };
  }
}
