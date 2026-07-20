import { SetMetadata } from '@nestjs/common';

export const FEATURE_KEY_METADATA = 'require_feature';

export interface RequireFeatureOptions {
  /** If true, a successful check atomically increments usage (e.g. product creation). Read-only routes should omit this. */
  consume?: boolean;
  amount?: number;
}

/**
 * Gates a route behind a subscription feature/quota check.
 * Must be paired with FeatureAccessGuard, and should run after
 * JwtAuthGuard + RoleGuard so req.user.companyId is already populated.
 *
 * @example
 * @Post('create')
 * @UseGuards(JwtAuthGuard, RoleGuard, FeatureAccessGuard)
 * @RequireFeature('max_products', { consume: true })
 * createProduct(...) {}
 */
export const RequireFeature = (featureKey: string, options: RequireFeatureOptions = {}) =>
  SetMetadata(FEATURE_KEY_METADATA, {
    featureKey,
    consume: options.consume ?? false,
    amount: options.amount ?? 1,
  });
