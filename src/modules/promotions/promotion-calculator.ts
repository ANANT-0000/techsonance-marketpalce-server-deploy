import {
  BundleDealConfig,
  BuyXGetYConfig,
  DiscountConfig,
  FixedAmountConfig,
  FreeShippingConfig,
  PercentageOffConfig,
  PromotionType,
  TieredDiscountConfig,
} from '../../drizzle/types/types';

export interface CartContext {
  grandTotal: number; // post-tax subtotal before promotion
  itemCount: number; // total units across all line items
  shippingAmount: number; // current shipping fee
  // line items needed for BuyXGetY resolution
  lineItems: {
    product_variant_id: string;
    quantity: number;
    unit_price: number; // pre-tax unit price
  }[];
}

export interface DiscountResult {
  discountAmount: number; // actual ₹ to deduct (rounded, capped, never > grandTotal)
  grandTotalAfter: number; // grandTotal - discountAmount
  appliedTierPercent?: number; // for tiered_discount — which tier fired
  shippingWaived?: number; // for free_shipping
  freeItemVariantId?: string | null; // for buy_x_get_y
}

// ── helpers ────────────────────────────────────────────────────────────────

export function multiplyRoundDivide(n: number): number {
  return Math.round(n * 100) / 100;
}

export function clamp(discount: number, grandTotal: number): number {
  return Math.min(Math.max(discount, 0), grandTotal);
}

// ── per-type calculators ───────────────────────────────────────────────────

function calcPercentageOff(
  config: PercentageOffConfig,
  ctx: CartContext,
): DiscountResult {
  const raw = (ctx.grandTotal * config.value) / 100;
  const discountAmount = clamp(
    config.cap !== undefined && config.cap !== null && config.cap > 0
      ? Math.min(raw, config?.cap)
      : raw,
    ctx.grandTotal,
  );
  return {
    discountAmount: multiplyRoundDivide(discountAmount),
    grandTotalAfter: multiplyRoundDivide(ctx.grandTotal - discountAmount),
  };
}

function calcFixedAmount(
  config: FixedAmountConfig,
  ctx: CartContext,
): DiscountResult {
  const discountAmount = clamp(config.value, ctx.grandTotal);
  return {
    discountAmount: multiplyRoundDivide(discountAmount),
    grandTotalAfter: multiplyRoundDivide(ctx.grandTotal - discountAmount),
  };
}

function calcTieredDiscount(
  config: TieredDiscountConfig,
  ctx: CartContext,
): DiscountResult {
  // Sort descending so we match the highest qualifying tier first
  const applicableTier = [...config.tiers]
    .sort((a, b) => b.min_cart - a.min_cart)
    .find((tier) => ctx.grandTotal >= tier.min_cart);

  if (!applicableTier) {
    return {
      discountAmount: 0,
      grandTotalAfter: multiplyRoundDivide(ctx.grandTotal),
    };
  }

  const discountAmount = clamp(
    (ctx.grandTotal * applicableTier.percent) / 100,
    ctx.grandTotal,
  );

  return {
    discountAmount: multiplyRoundDivide(discountAmount),
    grandTotalAfter: multiplyRoundDivide(ctx.grandTotal - discountAmount),
    appliedTierPercent: applicableTier.percent,
  };
}

function calcFreeShipping(
  config: FreeShippingConfig,
  ctx: CartContext,
): DiscountResult {
  const shippingWaived = multiplyRoundDivide(
    config.max_shipping_waived !== undefined
      ? Math.min(ctx.shippingAmount, config.max_shipping_waived)
      : ctx.shippingAmount,
  );

  return {
    // Shipping waived is separate from cart discount — grandTotal unchanged
    // Your order total_amount should already include shipping; if not, set
    // discountAmount: 0 and handle shippingWaived at the order level instead
    discountAmount: shippingWaived,
    grandTotalAfter: multiplyRoundDivide(ctx.grandTotal - shippingWaived),
    shippingWaived,
  };
}

function calcBuyXGetY(
  config: BuyXGetYConfig,
  ctx: CartContext,
): DiscountResult {
  const totalQty = ctx.lineItems.reduce((sum, item) => sum + item.quantity, 0);

  // Not enough items in cart to trigger the deal
  if (totalQty < config.buy_qty) {
    return {
      discountAmount: 0,
      grandTotalAfter: multiplyRoundDivide(ctx.grandTotal),
    };
  }

  // How many "get" sets does this cart earn?
  const earnedSets = Math.floor(totalQty / (config.buy_qty + config.get_qty));
  const freeUnits = earnedSets * config.get_qty;

  let freeItemPrice = 0;
  let freeItemVariantId: string | null = null;

  if (config.get_product_variant_id) {
    // Discount applies to the specific variant
    const targetItem = ctx.lineItems.find(
      (item) => item.product_variant_id === config.get_product_variant_id,
    );
    freeItemPrice = targetItem?.unit_price ?? 0;
    freeItemVariantId = config.get_product_variant_id;
  } else {
    // No specific item — apply to cheapest item(s) in cart
    const sorted = [...ctx.lineItems].sort(
      (a, b) => a.unit_price - b.unit_price,
    );
    freeItemPrice = sorted[0]?.unit_price ?? 0;
    freeItemVariantId = sorted[0]?.product_variant_id ?? null;
  }

  const discountAmount = clamp(
    multiplyRoundDivide(
      freeUnits * freeItemPrice * (config.get_discount_percent / 100),
    ),
    ctx.grandTotal,
  );

  return {
    discountAmount,
    grandTotalAfter: multiplyRoundDivide(ctx.grandTotal - discountAmount),
    freeItemVariantId,
  };
}

function calcBundleDeal(
  config: BundleDealConfig,
  ctx: CartContext,
): DiscountResult {
  // Verify all bundle variants are present in the cart
  const cartVariantIds = new Set(
    ctx.lineItems.map((item) => item.product_variant_id),
  );
  const allPresent = config.product_variant_ids.every((id) =>
    cartVariantIds.has(id),
  );

  if (!allPresent) {
    return {
      discountAmount: 0,
      grandTotalAfter: multiplyRoundDivide(ctx.grandTotal),
    };
  }

  const discountAmount = clamp(
    multiplyRoundDivide(ctx.grandTotal - config.bundle_price),
    ctx.grandTotal,
  );

  return {
    discountAmount,
    grandTotalAfter: multiplyRoundDivide(ctx.grandTotal - discountAmount),
  };
}

export function calculatePromotionDiscount(
  promotionType: PromotionType,
  discountConfig: DiscountConfig,
  ctx: CartContext,
): DiscountResult {
  switch (promotionType) {
    case PromotionType.PERCENTAGE:
      return calcPercentageOff(discountConfig as PercentageOffConfig, ctx);

    case PromotionType.FIXED_AMOUNT:
      return calcFixedAmount(discountConfig as FixedAmountConfig, ctx);

    case PromotionType.TIERED_DISCOUNT:
      return calcTieredDiscount(discountConfig as TieredDiscountConfig, ctx);

    case PromotionType.FREE_SHIPPING:
      return calcFreeShipping(discountConfig as FreeShippingConfig, ctx);

    case PromotionType.BUY_X_GET_Y:
      return calcBuyXGetY(discountConfig as BuyXGetYConfig, ctx);

    case PromotionType.BUNDLE_DEAL:
      return calcBundleDeal(discountConfig as BundleDealConfig, ctx);

    default:
      return {
        discountAmount: 0,
        grandTotalAfter: multiplyRoundDivide(ctx.grandTotal),
      };
  }
}
