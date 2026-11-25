import { Injectable } from '@nestjs/common';
import { PartnerApprovalStatus, Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { hasActiveProductSale } from '../../common/money/discount';
import { roundRialUp } from '../../common/money/rial';

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

/** Absolute override or percent/fixed adjustment (pricing-grid spec §2.6). */
export interface ProductOverride {
  type: 'PERCENT' | 'FIXED' | null;
  value: Prisma.Decimal | null;
  overridePrice: Prisma.Decimal | null;
}

/** Product-level sale + B2B price inputs for a single line. */
export interface LineSaleInput {
  regularPrice: Prisma.Decimal | string | number;
  discountedPrice?: Prisma.Decimal | string | number | null;
  discountStartsAt?: Date | null;
  discountEndsAt?: Date | null;
  partnerPrice?: Prisma.Decimal | string | number | null;
  partnerEligible?: boolean;
}

export interface PartnerPricing {
  /** Partner tier discount percent (0 for non-partners). */
  tierPercent: Prisma.Decimal;
  /** True only for an authenticated, phone-verified APPROVED partner. */
  eligible: boolean;
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
   * Partner pricing for the user: tier percent plus eligibility. Eligible
   * means an APPROVED, non-deleted partner whose owner account is ACTIVE —
   * i.e. mobile/phone verification has succeeded (auth marks ACTIVE only on
   * OTP verification). Never throws — pricing degrades to retail.
   */
  async partnerPricingForUser(userId: string): Promise<PartnerPricing> {
    try {
      const partner = await this.prisma.partner.findFirst({
        where: {
          profile: { userId },
          approvalStatus: PartnerApprovalStatus.APPROVED,
          deletedAt: null,
        },
        select: {
          tier: { select: { discountPercent: true } },
          profile: { select: { user: { select: { status: true, deletedAt: true } } } },
        },
      });
      const eligible =
        partner !== null &&
        partner.profile.user.status === UserStatus.ACTIVE &&
        partner.profile.user.deletedAt === null;
      if (!eligible) {
        return { tierPercent: new Prisma.Decimal(0), eligible: false };
      }
      const raw = partner?.tier?.discountPercent;
      if (raw === null || raw === undefined) {
        return { tierPercent: new Prisma.Decimal(0), eligible: true };
      }
      const pct = new Prisma.Decimal(raw.toString());
      if (!pct.isFinite() || pct.isNegative() || pct.greaterThan(100)) {
        return { tierPercent: new Prisma.Decimal(0), eligible: true };
      }
      return { tierPercent: pct, eligible: true };
    } catch {
      return { tierPercent: new Prisma.Decimal(0), eligible: false };
    }
  }

  /** Tier discount percent for the user (0 for guests/retail/unverified). */
  async tierDiscountForUser(userId: string): Promise<Prisma.Decimal> {
    return (await this.partnerPricingForUser(userId)).tierPercent;
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
   * Active category rule for the product's category. Exact-category rules
   * win over descendant-scoped rules on an ancestor. Within a category,
   * lowest `priority` wins, ties break by newest row. Null when none applies.
   * Never throws — pricing must degrade, never 500 the cart.
   */
  async categoryRuleFor(
    categoryId: string | null,
    now = new Date(),
  ): Promise<PriceAdjustment | null> {
    if (!categoryId) {
      return null;
    }
    try {
      const exact = await this.activeRuleForCategory(categoryId, false, now);
      if (exact !== null) {
        return exact;
      }
      // Walk the live ancestor chain looking for includeDescendants rules.
      // Depth is bounded by the category tree (small); each step is one
      // indexed lookup by primary key.
      let currentId = categoryId;
      const seen = new Set<string>([categoryId]);
      for (let depth = 0; depth < 32; depth += 1) {
        const category = await this.prisma.category.findUnique({
          where: { id: currentId },
          select: { parentId: true, deletedAt: true },
        });
        if (!category || category.deletedAt !== null || category.parentId === null) {
          return null;
        }
        if (seen.has(category.parentId)) {
          return null;
        }
        seen.add(category.parentId);
        const inherited = await this.activeRuleForCategory(
          category.parentId,
          true,
          now,
        );
        if (inherited !== null) {
          return inherited;
        }
        currentId = category.parentId;
      }
      return null;
    } catch {
      return null;
    }
  }

  /** One category's winning active rule (optionally requiring descendants scope). */
  private async activeRuleForCategory(
    categoryId: string,
    requireDescendants: boolean,
    now: Date,
  ): Promise<PriceAdjustment | null> {
    const rows = await this.prisma.categoryPriceRule.findMany({
      where: {
        categoryId,
        isActive: true,
        ...(requireDescendants ? { includeDescendants: true } : {}),
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      },
      select: {
        type: true,
        value: true,
        endsAt: true,
        priority: true,
        createdAt: true,
      },
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
  }

  /**
   * Active product override for the product (at most one row). Null when
   * none applies. Never throws.
   */
  async productOverrideFor(
    productId: string,
    now = new Date(),
  ): Promise<ProductOverride | null> {
    try {
      const row = await this.prisma.productPriceOverride.findUnique({
        where: { productId },
        select: {
          type: true,
          value: true,
          overridePrice: true,
          isActive: true,
          startsAt: true,
          endsAt: true,
        },
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
      if (row.overridePrice !== null) {
        const absolute = new Prisma.Decimal(row.overridePrice.toString());
        if (!absolute.isFinite() || absolute.lessThanOrEqualTo(0)) {
          return null;
        }
        return { type: null, value: null, overridePrice: absolute };
      }
      if (row.type === null || row.value === null) {
        return null;
      }
      if (!isValidAdjustment(row.type, row.value)) {
        return null;
      }
      return {
        type: row.type,
        value: row.value,
        overridePrice: null,
      };
    } catch {
      return null;
    }
  }

  /**
   * Batched overrides for a listing page. Same active/window/validity rules as
   * `productOverrideFor`, one query instead of N.
   */
  async productOverridesFor(
    productIds: string[],
    now = new Date(),
  ): Promise<Map<string, ProductOverride | null>> {
    const result = new Map<string, ProductOverride | null>();
    if (productIds.length === 0) {
      return result;
    }
    try {
      const rows = await this.prisma.productPriceOverride.findMany({
        where: { productId: { in: productIds } },
        select: {
          productId: true,
          type: true,
          value: true,
          overridePrice: true,
          isActive: true,
          startsAt: true,
          endsAt: true,
        },
      });
      const byProduct = new Map(rows.map((row) => [row.productId, row]));
      for (const productId of productIds) {
        const row = byProduct.get(productId);
        if (
          !row ||
          !row.isActive ||
          (row.startsAt !== null && row.startsAt > now) ||
          (row.endsAt !== null && row.endsAt < now)
        ) {
          result.set(productId, null);
          continue;
        }
        if (row.overridePrice !== null) {
          const absolute = new Prisma.Decimal(row.overridePrice.toString());
          result.set(
            productId,
            absolute.greaterThan(0)
              ? { type: null, value: null, overridePrice: absolute }
              : null,
          );
          continue;
        }
        result.set(
          productId,
          row.type !== null &&
            row.value !== null &&
            isValidAdjustment(row.type, row.value)
            ? { type: row.type, value: row.value, overridePrice: null }
            : null,
        );
      }
      return result;
    } catch {
      return result;
    }
  }

  /**
   * Batched active promotions for listing/detail cards. Scope matching mirrors
   * `activePromotionsFor`; one query per page.
   */
  async activePromotionsByProduct(
    scopes: PriceScope[],
    now = new Date(),
  ): Promise<Map<string, PromotionRow[]>> {
    const result = new Map<string, PromotionRow[]>();
    if (scopes.length === 0) {
      return result;
    }
    try {
      const productIds = [...new Set(scopes.map((scope) => scope.productId))];
      const categoryIds = [
        ...new Set(
          scopes
            .map((scope) => scope.categoryId)
            .filter((value): value is string => value !== null),
        ),
      ];
      const brandIds = [
        ...new Set(
          scopes
            .map((scope) => scope.brandId)
            .filter((value): value is string => value !== null),
        ),
      ];
      const rows = await this.prisma.promotion.findMany({
        where: {
          isActive: true,
          startsAt: { lte: now },
          endsAt: { gte: now },
          OR: [
            { productId: { in: productIds } },
            ...(categoryIds.length > 0
              ? [{ categoryId: { in: categoryIds } }]
              : []),
            ...(brandIds.length > 0 ? [{ brandId: { in: brandIds } }] : []),
            { productId: null, categoryId: null, brandId: null },
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
      for (const scope of scopes) {
        result.set(
          scope.productId,
          rows.filter(
            (row) =>
              row.productId === scope.productId ||
              (row.productId === null &&
                row.categoryId !== null &&
                row.categoryId === scope.categoryId) ||
              (row.productId === null &&
                row.categoryId === null &&
                row.brandId !== null &&
                row.brandId === scope.brandId) ||
              (row.productId === null &&
                row.categoryId === null &&
                row.brandId === null),
          ),
        );
      }
      return result;
    } catch {
      return result;
    }
  }

  /**
   * Full server-side resolution for one line:
   *   regular price → active product sale OR (category rule → override)
   *   → partner price/tier → bulk → best promotion.
   *
   * Precedence is deliberate and non-stacking (pricing-grid spec §2.5/§2.6):
   * - An active product sale price replaces the category rule and product
   *   adjustment for that line (product-specific beats category-wide).
   * - An absolute product override replaces the running retail price.
   * - An authorized partner's explicit `partnerPrice` replaces all retail
   *   price-setting rules and the tier percentage (no double B2B discount).
   * - Quantity bulk and one best scheduled promotion apply after the chosen
   *   base, exactly as the approved pricing-engine §5 chain.
   */
  async resolveUnitPrice(
    userId: string | null,
    input: {
      basePrice: Prisma.Decimal | string | number;
      quantity: number;
      discountedPrice?: Prisma.Decimal | string | number | null;
      discountStartsAt?: Date | null;
      discountEndsAt?: Date | null;
      partnerPrice?: Prisma.Decimal | string | number | null;
    } & PriceScope,
  ): Promise<Prisma.Decimal> {
    const [partner, promotions, categoryRule, override] = await Promise.all([
      userId
        ? this.partnerPricingForUser(userId)
        : Promise.resolve({
            tierPercent: new Prisma.Decimal(0),
            eligible: false,
          }),
      this.activePromotionsFor(input, new Date()),
      this.categoryRuleFor(input.categoryId),
      this.productOverrideFor(input.productId),
    ]);
    return PricingService.resolveLine(
      new Prisma.Decimal(input.basePrice.toString()),
      input.quantity,
      partner.tierPercent,
      promotions,
      { categoryRule, override },
      {
        regularPrice: input.basePrice,
        discountedPrice: input.discountedPrice,
        discountStartsAt: input.discountStartsAt,
        discountEndsAt: input.discountEndsAt,
        partnerPrice: input.partnerPrice,
        partnerEligible: partner.eligible,
      },
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
    adjustments: {
      categoryRule?: PriceAdjustment | null;
      override?: PriceAdjustment | ProductOverride | null;
    } = {},
    sale?: LineSaleInput,
  ): Prisma.Decimal {
    let price = basePrice;
    if (price.isNegative()) {
      price = new Prisma.Decimal(0);
    }

    // B2B explicit partner price: replaces retail price-setting rules AND the
    // tier percentage so the two B2B mechanisms never stack.
    const partnerPrice = sale?.partnerEligible
      ? decimalOrNull(sale.partnerPrice)
      : null;
    if (partnerPrice !== null && partnerPrice.greaterThan(0)) {
      price = partnerPrice;
    } else {
      const activeSale =
        sale !== undefined &&
        hasActiveProductSale({
          price: sale.regularPrice,
          discountedPrice: sale.discountedPrice,
          discountStartsAt: sale.discountStartsAt,
          discountEndsAt: sale.discountEndsAt,
        });
      if (activeSale) {
        // Product-specific sale supersedes category/override adjustments.
        price = new Prisma.Decimal(String(sale.discountedPrice));
      } else {
        price = applyAdjustment(price, adjustments.categoryRule);
        price = applyOverride(price, adjustments.override);
      }
      price = applyPercentOff(price, tierDiscountPercent);
    }
    price = applyPercentOff(price, new Prisma.Decimal(bulkPercentFor(quantity)));
    price = applyBestPromotion(price, quantity, promotions);
    if (price.isNegative()) {
      return new Prisma.Decimal(0);
    }
    // SS-900: the single customer-facing Rial rounding point. Cart, checkout
    // and order snapshots all call this resolver, so the displayed and
    // charged amounts cannot diverge.
    return roundRialUp(price.toDecimalPlaces(0));
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
  const discounted = price.sub(new Prisma.Decimal(adjustment.value.toString()));
  // A fixed discount at/above the running price is invalid for this line.
  // Skip it rather than publishing a zero/free price.
  return discounted.lessThanOrEqualTo(0) ? price : discounted;
}

/**
 * Applies a product override: an absolute override replaces the running
 * price; otherwise it is the same PERCENT|FIXED adjustment as before.
 */
function applyOverride(
  price: Prisma.Decimal,
  override: PriceAdjustment | ProductOverride | null | undefined,
): Prisma.Decimal {
  if (!override) {
    return price;
  }
  if ('overridePrice' in override && override.overridePrice !== null) {
    const absolute = new Prisma.Decimal(override.overridePrice.toString());
    if (absolute.isFinite() && absolute.greaterThan(0)) {
      return absolute;
    }
    return price;
  }
  if (override.type === null || override.value === null) {
    return price;
  }
  return applyAdjustment(price, {
    type: override.type,
    value: override.value,
  });
}

function decimalOrNull(
  value: Prisma.Decimal | string | number | null | undefined,
): Prisma.Decimal | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  try {
    const parsed =
      value instanceof Prisma.Decimal ? value : new Prisma.Decimal(String(value));
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
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
      if (!v.isFinite() || v.lessThanOrEqualTo(0) || v.greaterThanOrEqualTo(price)) {
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
