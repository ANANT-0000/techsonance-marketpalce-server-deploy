import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module.js';
import { product_price_history } from '../../drizzle/schema/index.js';
import { ExtractTablesWithRelations } from 'drizzle-orm';
import { PgTransaction } from 'drizzle-orm/pg-core';
import * as schema from '../../drizzle/schema/index.js';

type TxType = PgTransaction<
  any,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

@Injectable()
export class PricingService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleService) {}

  /**
   * Computes the display discount percentage based on compareAtPrice and price.
   */
  computeDiscountPercent(
    compareAtPrice: number | string | null,
    price: number | string,
  ): number {
    const cp = Number(compareAtPrice);
    const p = Number(price);

    if (!cp || isNaN(cp) || isNaN(p) || cp <= p || cp === 0) {
      return 0;
    }

    return Math.round(((cp - p) / cp) * 100);
  }

  /**
   * Resolves the current valid price and discount details for a variant, 
   * considering sale windows.
   */
  resolveVariantPrice(variant: {
    price: string | number;
    compare_at_price?: string | number | null;
    sale_starts_at?: Date | null;
    sale_ends_at?: Date | null;
  }): {
    price: number;
    compareAtPrice: number | null;
    discountPercent: number;
  } {
    let price = Number(variant.price);
    let compareAtPrice = variant.compare_at_price ? Number(variant.compare_at_price) : null;
    
    const now = new Date();
    
    let isSaleActive = true;
    if (variant.sale_starts_at && now < new Date(variant.sale_starts_at)) {
      isSaleActive = false;
    }
    if (variant.sale_ends_at && now > new Date(variant.sale_ends_at)) {
      isSaleActive = false;
    }

    if (!isSaleActive) {
      if (compareAtPrice && compareAtPrice > price) {
        price = compareAtPrice; // Revert to original price since sale expired
      }
      compareAtPrice = null;
    }

    const discountPercent = this.computeDiscountPercent(compareAtPrice, price);

    return {
      price,
      compareAtPrice,
      discountPercent,
    };
  }

  /**
   * Calculates subtotal for an order given the resolved lines.
   */
  calculateOrderTotals(lines: { price: number; quantity: number }[]): number {
    return lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  }

  /**
   * Records a price change into the product_price_history table.
   */
  async recordPriceChange(
    tx: TxType,
    variantId: string,
    oldPrice: string | null,
    newPrice: string,
    oldCompareAtPrice: string | null,
    newCompareAtPrice: string | null,
    userId?: string,
  ) {
    if (oldPrice === newPrice && oldCompareAtPrice === newCompareAtPrice) {
      return; // No change
    }

    await tx.insert(product_price_history).values({
      product_variant_id: variantId,
      old_price: oldPrice,
      new_price: newPrice,
      old_compare_at_price: oldCompareAtPrice,
      new_compare_at_price: newCompareAtPrice,
      changed_by: userId,
    });
  }
}
