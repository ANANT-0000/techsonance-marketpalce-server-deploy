import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleService } from '../../drizzle/drizzle.module.js';
import { vendor_shipping_preferences } from '../../drizzle/schema/index.js';
import { ShippingStrategy } from '../../drizzle/types/types.js';

export interface CourierOption {
  courier_company_id: number;
  courier_name: string;
  rate: number;
  rating: number | string;
  estimated_delivery_days: number;
  delivery_performance?: number;
  pickup_performance?: number;
  cod_charges?: number;
  is_surface?: boolean;
}

export interface BestShippingOptionResult {
  selectedOption: CourierOption | null;
  strategyUsed: ShippingStrategy;
  fallbackTriggered: boolean;
  scoringDetails?: Record<number, number>; // courier_company_id -> score
  allEligibleCouriers: CourierOption[];
}

@Injectable()
export class ShippingPreferenceEngineService {
  private readonly logger = new Logger(ShippingPreferenceEngineService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleService) {}

  /**
   * Resolves the optimal shipping courier based on vendor configurations,
   * applying exclusion lists, manual priorities, and automated strategies.
   *
   * @param rawCouriers The couriers returned from ShipRocket serviceability API
   * @param vendorId The vendor ID whose preferences need to be applied
   */
  async resolveBestShippingOption(
    rawCouriers: CourierOption[],
    vendorId: string,
  ): Promise<BestShippingOptionResult> {
    this.logger.log(
      `Resolving shipping option for vendor ${vendorId} with ${rawCouriers?.length ?? 0} couriers`,
    );

    if (!rawCouriers || rawCouriers.length === 0) {
      return {
        selectedOption: null,
        strategyUsed: ShippingStrategy.NONE,
        fallbackTriggered: false,
        allEligibleCouriers: [],
      };
    }

    // 1. Fetch vendor preferences from the database
    const [preferences] = await this.db
      .select()
      .from(vendor_shipping_preferences)
      .where(eq(vendor_shipping_preferences.vendor_id, vendorId))
      .limit(1);

    // 2. Failsafe default settings if the vendor has not configured preferences yet
    const priorityList = preferences?.priority_list ?? [];
    const primaryStrategy = preferences?.primary_strategy ?? ShippingStrategy.LOWEST_COST;
    const fallbackStrategy = preferences?.fallback_strategy ?? ShippingStrategy.LOWEST_COST;
    const exclusionRules = preferences?.exclusion_rules ?? {};

    // 3. Exclusions/Thresholds Filter
    const blockedCourierIds = exclusionRules.blocked_courier_ids || [];
    const blockedCourierNames = exclusionRules.never_use_couriers || [];
    const maxCost = exclusionRules.max_cost_threshold;

    let filteredCouriers = rawCouriers.filter((courier) => {
      // Check if courier ID is blocked
      if (blockedCourierIds.includes(courier.courier_company_id)) {
        return false;
      }
      // Check if courier name is blocked (case-insensitive)
      if (
        blockedCourierNames.some(
          (name) => name.toLowerCase() === courier.courier_name.toLowerCase(),
        )
      ) {
        return false;
      }
      // Check if rate exceeds the vendor's cost threshold
      if (maxCost !== undefined && maxCost !== null && courier.rate > maxCost) {
        return false;
      }
      return true;
    });

    // Failsafe: If exclusions filter out all options, ignore rules to prevent order blockage
    if (filteredCouriers.length === 0) {
      this.logger.warn(
        `All available couriers were blocked by exclusion rules for vendor ${vendorId}. Overriding rules to prevent order failure.`,
      );
      filteredCouriers = [...rawCouriers];
    }

    // Strategy helpers
    const selectLowestCost = (options: CourierOption[]): CourierOption => {
      return [...options].sort((a, b) => a.rate - b.rate)[0];
    };

    const selectFastest = (options: CourierOption[]): CourierOption => {
      return [...options].sort((a, b) => {
        if (a.estimated_delivery_days !== b.estimated_delivery_days) {
          return a.estimated_delivery_days - b.estimated_delivery_days;
        }
        // Tie-breaker: cheaper option
        return a.rate - b.rate;
      })[0];
    };

    const evaluateHybridScore = (
      options: CourierOption[],
    ): {
      selected: CourierOption;
      scores: Record<number, number>;
      sorted: CourierOption[];
    } => {
      const rates = options.map((o) => o.rate);
      const minRate = Math.min(...rates);

      const speeds = options.map((o) => o.estimated_delivery_days);
      const minDays = Math.min(...speeds);

      const scores: Record<number, number> = {};

      const mapped = options.map((courier) => {
        // Rating: (rating / 5) * 100. Handle string and float types.
        const parsedRating =
          typeof courier.rating === 'string'
            ? parseFloat(courier.rating)
            : courier.rating;
        const ratingScore = ((parsedRating || 0) / 5) * 100;

        // Cost Score: relative to cheapest courier (cheaper is better)
        const costScore =
          courier.rate > 0 ? (minRate / courier.rate) * 100 : 100;

        // Speed Score: relative to fastest courier (fewer days is better)
        const speedScore =
          courier.estimated_delivery_days > 0
            ? (minDays / courier.estimated_delivery_days) * 100
            : 100;

        // Hybrid Weighted score: 40% rating, 30% cost, 30% speed
        const score = 0.4 * ratingScore + 0.3 * costScore + 0.3 * speedScore;
        scores[courier.courier_company_id] = parseFloat(score.toFixed(2));

        return { ...courier, score };
      });

      // Sort descending by calculated score
      const sorted = mapped.sort((a, b) => b.score - a.score);
      const cleanedSorted = sorted.map(({ score, ...rest }) => rest);

      return {
        selected: cleanedSorted[0],
        scores,
        sorted: cleanedSorted,
      };
    };

    let selectedOption: CourierOption | null = null;
    let strategyUsed = primaryStrategy;
    let fallbackTriggered = false;
    let scoringDetails: Record<number, number> | undefined;
    let sortedEligibleList = [...filteredCouriers];

    // 4. Resolve via Tiered Preference Rules
    if (primaryStrategy === ShippingStrategy.PRIORITY) {
      const prioritySet = new Set(priorityList);
      const availablePriorityOptions = filteredCouriers.filter((courier) =>
        prioritySet.has(courier.courier_company_id),
      );

      if (availablePriorityOptions.length > 0) {
        // Sort priority couriers in the precise vendor order
        availablePriorityOptions.sort((a, b) => {
          return (
            priorityList.indexOf(a.courier_company_id) -
            priorityList.indexOf(b.courier_company_id)
          );
        });
        selectedOption = availablePriorityOptions[0];
        sortedEligibleList = availablePriorityOptions;
      } else {
        // Fallback Strategy Triggered (none of the priority list carriers are available)
        fallbackTriggered = true;
        strategyUsed = fallbackStrategy;

        this.logger.log(
          `No manual priority carriers available for vendor ${vendorId}. Executing fallback strategy: ${fallbackStrategy}`,
        );

        if (fallbackStrategy === ShippingStrategy.FASTEST) {
          selectedOption = selectFastest(filteredCouriers);
          sortedEligibleList = [...filteredCouriers].sort((a, b) => {
            if (a.estimated_delivery_days !== b.estimated_delivery_days) {
              return a.estimated_delivery_days - b.estimated_delivery_days;
            }
            return a.rate - b.rate;
          });
        } else if (fallbackStrategy === ShippingStrategy.HYBRID) {
          const hybrid = evaluateHybridScore(filteredCouriers);
          selectedOption = hybrid.selected;
          scoringDetails = hybrid.scores;
          sortedEligibleList = hybrid.sorted;
        } else {
          // Default to LOWEST_COST
          selectedOption = selectLowestCost(filteredCouriers);
          sortedEligibleList = [...filteredCouriers].sort(
            (a, b) => a.rate - b.rate,
          );
        }
      }
    } else {
      // Execute directly when primary strategy is not PRIORITY
      if (primaryStrategy === ShippingStrategy.FASTEST) {
        selectedOption = selectFastest(filteredCouriers);
        sortedEligibleList = [...filteredCouriers].sort((a, b) => {
          if (a.estimated_delivery_days !== b.estimated_delivery_days) {
            return a.estimated_delivery_days - b.estimated_delivery_days;
          }
          return a.rate - b.rate;
        });
      } else if (primaryStrategy === ShippingStrategy.HYBRID) {
        const hybrid = evaluateHybridScore(filteredCouriers);
        selectedOption = hybrid.selected;
        scoringDetails = hybrid.scores;
        sortedEligibleList = hybrid.sorted;
      } else {
        // Default to LOWEST_COST
        selectedOption = selectLowestCost(filteredCouriers);
        sortedEligibleList = [...filteredCouriers].sort(
          (a, b) => a.rate - b.rate,
        );
      }
    }

    return {
      selectedOption,
      strategyUsed,
      fallbackTriggered,
      scoringDetails,
      allEligibleCouriers: sortedEligibleList,
    };
  }
}
