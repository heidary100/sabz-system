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
  endsAt: Date;
}

/**
 * Category-rule / product-override adjustment (SS-235 Round B1). Same
 * PERCENT|FIXED-off semantics as a promotion, but applied to the running
 * base BEFORE the partner tier step (spec §5: Base → CategoryRule →
 * Override → Tier → Bulk → Promotion). Invalid rows are ignored, never
 * fatal.
 */
export interface PriceAdjustment {
  type: 'PERCENT' | 'FIXED';
  value: Prisma.Decimal;
}

/**
 * Server-side pricing engine (SS-235 Round B1).
 *
 * Resolution order per pricing-engine.md §5 (coupons + tax excluded):
 * base variant price → category rule → product override → partner tier →
 * bulk → scheduled promotion. RFQ products stay non-purchasable via the
 * existing CALL_FOR_PRICE guard in cart/checkout. The result is never
 * negative (PRICE-005).
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
          endsAt: true,
        },
      });
      return rows;
    } catch {
      return [];
    }
  }

  /**
   * Earliest active-promotion `endsAt` per product for a whole listing page
   * (SS-235 B1): a single query drives every card countdown, never N+1.
   * Scope matching mirrors `activePromotionsFor`. Returns productId →
   * ISO timestamp; products without an applicable promotion are absent.
   * Never throws — callers treat absence as "no countdown".
   */
  async promotionEndsAtByProduct(
    scopes: PriceScope[],
    now = new Date(),
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (scopes.length === 0) {
      return result;
    }
    try {
      const productIds = [...new Set(scopes.map((s) => s.productId))];
      const categoryIds = [...new Set(scopes.map((s) => s.categoryId).filter((v): v is string => v !== null))];
      const brandIds = [...new Set(scopes.map((s) => s.brandId).filter((v): v is string => v !== null))];
      const rows = await this.prisma.promotion.findMany({
        where: {
          isActive: true,
          startsAt: { lte: now },
          endsAt: { gte: now },
          OR: [
            { productId: { in: productIds } },
            ...(categoryIds.length > 0 ? [{ categoryId: { in: categoryIds } }] : []),
            ...(brandIds.length > 0 ? [{ brandId: { in: brandIds } }] : []),
            { productId: null, categoryId: null, brandId: null },
          ],
        },
        select: { productId: true, categoryId: true, brandId: true, endsAt: true },
      });
      for (const scope of scopes) {
        let earliest: Date | null = null;
        for (const row of rows) {
          const matches =
            row.productId === scope.productId ||
            (row.productId === null && row.categoryId !== null && row.categoryId === scope.categoryId) ||
            (row.productId === null &&
              row.categoryId === null &&
              row.brandId !== null &&
              row.brandId === scope.brandId) ||
            (row.productId === null && row.categoryId === null && row.brandId === null);
          if (matches && (earliest === null || row.endsAt < earliest)) {
            earliest = row.endsAt;
          }
        }
        if (earliest !== null) {
          result.set(scope.productId, earliest.toISOString());
        }
      }
      return result;
    } catch {
      return result;
    }
  }

  /**
   * Active category rule for the category: lowest `priority` wins, ties
   * break by newest row. Null when none applies. Never throws — pricing
   * must degrade, never 500 the cart.
   */
  async categoryRuleFor(
    categoryId: string | null,
    now = new Date(),
  ): Promise<PriceAdjustment | null> {
    if (!categoryId) {
      return null;
    }
    try {
      const rows = await this.prisma.categoryPriceRule.findMany({
        where: {
          categoryId,
          isActive: true,
          OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        },
        select: { type: true, value: true, endsAt: true, priority: true, createdAt: true },
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      });
      for (const row of rows) {
        if (row.endsAt !== null && row.endsAt < now) {
          continue;
        }
        if (!isValidAdjustment(row.type, row.value)) {
          continue;
        }
        return { type: row.type, value: row.value };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Active product override for the product (at most one row). Null when
   * none applies. Never throws.
   */
  async productOverrideFor(
    productId: string,
    now = new Date(),
  ): Promise<PriceAdjustment | null> {
    try {
      const row = await this.prisma.productPriceOverride.findUnique({
        where: { productId },
        select: { type: true, value: true, isActive: true, startsAt: true, endsAt: true },
      });
      if (!row || !row.isActive) {
        return null;
      }
      if (row.startsAt !== null && row.startsAt > now) {
        return null;
      }
      if (row.endsAt !== null && row.endsAt < now) {
        return null;
      }
      if (!isValidAdjustment(row.type, row.value)) {
        return null;
      }
      return { type: row.type, value: row.value };
    } catch {
      return null;
    }
  }

  /**
   * Full server-side resolution for one line: category rule → override →
   * tier → bulk → best promotion. Pure apart from the lookups above being
   * injected.
   */
  async resolveUnitPrice(
    userId: string | null,
    input: { basePrice: Prisma.Decimal | string | number; quantity: number } & PriceScope,
  ): Promise<Prisma.Decimal> {
    const [tierPct, promotions, categoryRule, override] = await Promise.all([
      userId ? this.tierDiscountForUser(userId) : Promise.resolve(new Prisma.Decimal(0)),
      this.activePromotionsFor(input, new Date()),
      this.categoryRuleFor(input.categoryId),
      this.productOverrideFor(input.productId),
    ]);
    return PricingService.resolveLine(
      new Prisma.Decimal(input.basePrice.toString()),
      input.quantity,
      tierPct,
      promotions,
      { categoryRule, override },
    );
  }

  /**
   * Pure price math (unit-testable without a database).
   * Invalid promotion/adjustment rows are ignored, never fatal.
   */
  static resolveLine(
    basePrice: Prisma.Decimal,
    quantity: number,
    tierDiscountPercent: Prisma.Decimal,
    promotions: PromotionRow[],
    adjustments: { categoryRule?: PriceAdjustment | null; override?: PriceAdjustment | null } = {},
  ): Prisma.Decimal {
    let price = basePrice;
    if (price.isNegative()) {
      price = new Prisma.Decimal(0);
    }
    price = applyAdjustment(price, adjustments.categoryRule);
    price = applyAdjustment(price, adjustments.override);
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

/** Validity gate shared by category rules and product overrides. */
function isValidAdjustment(type: string, value: Prisma.Decimal): boolean {
  const v = new Prisma.Decimal(value.toString());
  if (!v.isFinite() || v.lessThanOrEqualTo(0)) {
    return false;
  }
  if (type === 'PERCENT' && v.greaterThan(100)) {
    return false;
  }
  return type === 'PERCENT' || type === 'FIXED';
}

/** Applies one category-rule / override adjustment; invalid rows are no-ops. */
function applyAdjustment(
  price: Prisma.Decimal,
  adjustment: PriceAdjustment | null | undefined,
): Prisma.Decimal {
  if (!adjustment || !isValidAdjustment(adjustment.type, adjustment.value)) {
    return price;
  }
  if (adjustment.type === 'PERCENT') {
    return applyPercentOff(price, new Prisma.Decimal(adjustment.value.toString()));
  }
  return price.sub(new Prisma.Decimal(adjustment.value.toString()));
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
