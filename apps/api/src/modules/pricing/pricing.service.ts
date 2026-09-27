import { Injectable } from '@nestjs/common';
import { PartnerApprovalStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';

/**
 * Quantity thresholds for automatic bulk discounts (SS-235 Round A,
 * pricing-engine.md "Bulk Discounts"). Evaluated after tier pricing
 * (PRICE-006). Highest qualifying tier wins; no DB table yet — admin
 * configuration arrives with SS-240.
 */
const BULK_DISCOUNT_TIERS = [
  { minQuantity: 100, discountPercent: 10 },
  { minQuantity: 50, discountPercent: 7 },
  { minQuantity: 10, discountPercent: 3 },
] as const;

export interface PriceScope {
  productId: string;
  categoryId: string | null;
  brandId: string | null;
}

export interface PromotionRow {
  type: 'PERCENT' | 'FIXED';
  value: Prisma.Decimal;
  productId: string | null;
  categoryId: string | null;
  brandId: string | null;
  minQuantity: number;
}

/**
 * Server-side pricing engine (SS-235 Round A).
 *
 * Resolution order per pricing-engine.md §5 (Round-A subset):
 * base variant price → partner tier → bulk → scheduled promotion.
 * Category rules / product overrides / coupons / tax are deferred;
 * RFQ products stay non-purchasable via the existing CALL_FOR_PRICE
 * guard in cart/checkout. The result is never negative (PRICE-005).
 *
 * All money stays Rial verbatim (SS-207 "O-1"); callers freeze the
 * resolved unit price into cart DTOs and order snapshots.
 */
@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tier discount percent for the user: the APPROVED partner's tier, or
   * zero for guests / retail customers / non-approved partners
   * (PRICE-002, PRICE-003). Never throws — pricing must degrade to
   * retail, never 500 the cart.
   */
  async tierDiscountForUser(userId: string): Promise<Prisma.Decimal> {
    try {
      const partner = await this.prisma.partner.findFirst({
        where: {
          profile: { userId },
          approvalStatus: PartnerApprovalStatus.APPROVED,
          deletedAt: null,
        },
        select: { tier: { select: { discountPercent: true } } },
      });
      const raw = partner?.tier?.discountPercent;
      if (raw === null || raw === undefined) {
        return new Prisma.Decimal(0);
      }
      const pct = new Prisma.Decimal(raw.toString());
      if (!pct.isFinite() || pct.isNegative() || pct.greaterThan(100)) {
        return new Prisma.Decimal(0);
      }
      return pct;
    } catch {
      return new Prisma.Decimal(0);
    }
  }

  /** Currently active promotions scoped to the product (narrowest wins ties by best saving). */
  async activePromotionsFor(scope: PriceScope, now = new Date()): Promise<PromotionRow[]> {
    try {
      const rows = await this.prisma.promotion.findMany({
        where: {
          isActive: true,
          startsAt: { lte: now },
          endsAt: { gte: now },
          OR: [
            { productId: scope.productId },
            ...(scope.categoryId ? [{ categoryId: scope.categoryId }] : []),
            ...(scope.brandId ? [{ brandId: scope.brandId }] : []),
            {
              productId: null,
              categoryId: null,
              brandId: null,
            },
          ],
        },
        select: {
          type: true,
          value: true,
          productId: true,
          categoryId: true,
          brandId: true,
          minQuantity: true,
        },
      });
      return rows;
    } catch {
      return [];
    }
  }

  /**
   * Full server-side resolution for one line: tier → bulk → best
   * promotion. Pure apart from the two lookups above being injected.
   */
  async resolveUnitPrice(
    userId: string,
    input: { basePrice: Prisma.Decimal | string | number; quantity: number } & PriceScope,
  ): Promise<Prisma.Decimal> {
    const [tierPct, promotions] = await Promise.all([
      this.tierDiscountForUser(userId),
      this.activePromotionsFor(input, new Date()),
    ]);
    return PricingService.resolveLine(
      new Prisma.Decimal(input.basePrice.toString()),
      input.quantity,
      tierPct,
      promotions,
    );
  }

  /**
   * Pure price math (unit-testable without a database).
   * Invalid promotion rows are ignored, never fatal.
   */
  static resolveLine(
    basePrice: Prisma.Decimal,
    quantity: number,
    tierDiscountPercent: Prisma.Decimal,
    promotions: PromotionRow[],
  ): Prisma.Decimal {
    let price = basePrice;
    if (price.isNegative()) {
      price = new Prisma.Decimal(0);
    }
    price = applyPercentOff(price, tierDiscountPercent);
    price = applyPercentOff(price, new Prisma.Decimal(bulkPercentFor(quantity)));
    price = applyBestPromotion(price, quantity, promotions);
    if (price.isNegative()) {
      return new Prisma.Decimal(0);
    }
    return price.toDecimalPlaces(0);
  }
}

/** Bulk percent for a line quantity (highest qualifying tier). */
export function bulkPercentFor(quantity: number): number {
  for (const tier of BULK_DISCOUNT_TIERS) {
    if (quantity >= tier.minQuantity) {
      return tier.discountPercent;
    }
  }
  return 0;
}

function applyPercentOff(price: Prisma.Decimal, percent: Prisma.Decimal): Prisma.Decimal {
  if (!percent.isFinite() || percent.lessThanOrEqualTo(0)) {
    return price;
  }
  if (percent.greaterThanOrEqualTo(100)) {
    return new Prisma.Decimal(0);
  }
  return price.mul(new Prisma.Decimal(100).sub(percent)).div(100);
}

/** Single best applicable promotion (max Rial saving); ties prefer product scope. */
function applyBestPromotion(
  price: Prisma.Decimal,
  quantity: number,
  promotions: PromotionRow[],
): Prisma.Decimal {
  let best: Prisma.Decimal | null = null;
  let bestSpecificity = -1;
  for (const promo of promotions) {
    if (quantity < promo.minQuantity) {
      continue;
    }
    let candidate: Prisma.Decimal | null = null;
    if (promo.type === 'PERCENT') {
      const v = new Prisma.Decimal(promo.value.toString());
      if (!v.isFinite() || v.lessThanOrEqualTo(0) || v.greaterThan(100)) {
        continue;
      }
      candidate = applyPercentOff(price, v);
    } else {
      const v = new Prisma.Decimal(promo.value.toString());
      if (!v.isFinite() || v.lessThanOrEqualTo(0)) {
        continue;
      }
      candidate = price.sub(v);
    }
    // Specificity: product (3) > category (2) > brand (1) > sitewide (0).
    const specificity =
      promo.productId !== null ? 3 : promo.categoryId !== null ? 2 : promo.brandId !== null ? 1 : 0;
    if (
      best === null ||
      candidate.lessThan(best) ||
      (candidate.equals(best) && specificity > bestSpecificity)
    ) {
      best = candidate;
      bestSpecificity = specificity;
    }
  }
  return best ?? price;
}
