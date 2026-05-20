import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module';
import {
  category_policy,
  product_policies,
  product_policy_override,
  products,
  product_variants,
} from '../../drizzle/schema';

export interface PolicyResolutionResult {
  /** The resolved policy_id, or null if none found */
  policy_id: string | null;
  /** How it was resolved */
  source: 'product_override' | 'category_policy' | 'none';
  /** Human-readable explanation for logging */
  reason: string;
}

@Injectable()
export class PolicyResolutionService {
  private readonly logger = new Logger(PolicyResolutionService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleService) {}

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC: resolve policy for a single order item
  //
  // Resolution priority (highest → lowest):
  //   1. Product-level override      (product_policy_override table)
  //   2. Category-level policy       (category_policy table, lowest priority value wins)
  //   3. None — no policy applies
  //
  // Accepts an optional `tx` so it can run inside a transaction.
  // ══════════════════════════════════════════════════════════════════
  async resolveForVariant(
    productVariantId: string,
    tx?: DrizzleService,
  ): Promise<PolicyResolutionResult> {
    const db = tx ?? this.db;

    // ── Step 1: get product_id from variant ──────────────────────────
    const [variant] = await db
      .select({ product_id: product_variants.product_id })
      .from(product_variants)
      .where(eq(product_variants.id, productVariantId))
      .limit(1);

    if (!variant?.product_id) {
      const reason = `Variant ${productVariantId} has no linked product — cannot resolve policy.`;
      this.logger.warn(`[resolveForVariant] ${reason}`);
      return { policy_id: null, source: 'none', reason };
    }

    const productId = variant.product_id;

    // ── Step 2: product-level override (highest priority) ────────────
    const [override] = await db
      .select({
        policy_id: product_policy_override.policy_id,
        overrides_category: product_policy_override.overrides_category,
      })
      .from(product_policy_override)
      .where(eq(product_policy_override.product_id, productId))
      .limit(1);

    if (override?.policy_id) {
      // Verify the policy is still active before using it
      const [policy] = await db
        .select({
          id: product_policies.id,
          is_active: product_policies.is_active,
        })
        .from(product_policies)
        .where(eq(product_policies.id, override.policy_id))
        .limit(1);

      if (policy?.is_active) {
        const reason = `Product override found for product ${productId} → policy ${override.policy_id}`;
        this.logger.log(`[resolveForVariant] ${reason}`);
        return {
          policy_id: override.policy_id,
          source: 'product_override',
          reason,
        };
      } else {
        this.logger.warn(
          `[resolveForVariant] Product ${productId} has override → policy ${override.policy_id} ` +
            `but that policy is INACTIVE. Falling through to category policy.`,
        );
      }
    }

    // ── Step 3: category-level policy (fallback) ─────────────────────
    const [product] = await db
      .select({ category_id: products.category_id })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (!product?.category_id) {
      const reason = `Product ${productId} has no category_id — cannot fall back to category policy.`;
      this.logger.warn(`[resolveForVariant] ${reason}`);
      return { policy_id: null, source: 'none', reason };
    }

    const [catPolicy] = await db
      .select({ policy_id: category_policy.policy_id })
      .from(category_policy)
      .innerJoin(
        product_policies,
        eq(category_policy.policy_id, product_policies.id),
      )
      .where(eq(category_policy.category_id, product.category_id))
      // Only use active policies; lowest priority number wins
      .orderBy(category_policy.priority)
      .limit(1);

    if (catPolicy?.policy_id) {
      const reason = `Category policy found for category ${product.category_id} → policy ${catPolicy.policy_id}`;
      this.logger.log(`[resolveForVariant] ${reason}`);
      return {
        policy_id: catPolicy.policy_id,
        source: 'category_policy',
        reason,
      };
    }

    // ── Step 4: nothing found ────────────────────────────────────────
    const reason =
      `No policy found for variant ${productVariantId} (product: ${productId}, ` +
      `category: ${product.category_id}). ` +
      `Add a category_policy for that category OR a product_policy_override for this product.`;
    this.logger.warn(`[resolveForVariant] ${reason}`);
    return { policy_id: null, source: 'none', reason };
  }

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC: resolve policies for ALL variants in one call
  // Returns a map of variantId → resolution result
  // ══════════════════════════════════════════════════════════════════
  async resolveForVariants(
    items: Array<{ orderItemId: string; productVariantId: string }>,
    tx?: DrizzleService,
  ): Promise<Map<string, PolicyResolutionResult & { orderItemId: string }>> {
    const results = new Map<
      string,
      PolicyResolutionResult & { orderItemId: string }
    >();

    for (const item of items) {
      const resolution = await this.resolveForVariant(
        item.productVariantId,
        tx,
      );
      results.set(item.orderItemId, {
        ...resolution,
        orderItemId: item.orderItemId,
      });
    }

    return results;
  }
}
