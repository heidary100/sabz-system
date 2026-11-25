import { Prisma } from '@prisma/client';
import { roundRialUp } from './rial';

/**
 * Product sale-window semantics (pricing-grid spec §2.5).
 *
 * A discounted price is effective only when it is present, positive,
 * strictly below the regular price, and the optional window contains `now`
 * (inclusive bounds; open-ended sides always match). Expired or not-yet-active
 * sales are never shown or charged.
 */
export interface SaleWindow {
  price: Prisma.Decimal | string | number;
  discountedPrice?: Prisma.Decimal | string | number | null;
  discountStartsAt?: Date | string | null;
  discountEndsAt?: Date | string | null;
}

export function isDateWindowActive(
  startsAt: Date | string | null | undefined,
  endsAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  const timestamp = now.getTime();
  if (startsAt !== null && startsAt !== undefined) {
    const start = new Date(startsAt).getTime();
    if (Number.isNaN(start) || start > timestamp) {
      return false;
    }
  }
  if (endsAt !== null && endsAt !== undefined) {
    const end = new Date(endsAt).getTime();
    if (Number.isNaN(end) || end < timestamp) {
      return false;
    }
  }
  return true;
}

/** True when the row currently has a valid, active product sale. */
export function hasActiveProductSale(
  sale: SaleWindow,
  now: Date = new Date(),
): boolean {
  const discounted = decimalOrNull(sale.discountedPrice);
  if (discounted === null || discounted.lessThanOrEqualTo(0)) {
    return false;
  }
  const regular = decimalOrNull(sale.price);
  if (regular === null || discounted.greaterThanOrEqualTo(regular)) {
    return false;
  }
  return isDateWindowActive(sale.discountStartsAt, sale.discountEndsAt, now);
}

/**
 * The customer-facing pair before tier/promotions: the selling price (active
 * sale or regular) and the regular reference (only for a real discount).
 * Both are rounded UP once, in Rial.
 */
export function customerPricePair(
  sale: SaleWindow,
  now: Date = new Date(),
): { selling: Prisma.Decimal; regular: Prisma.Decimal | null } {
  const regularRaw = decimalOrNull(sale.price) ?? new Prisma.Decimal(0);
  const regular = roundRialUp(regularRaw);
  if (!hasActiveProductSale(sale, now)) {
    return { selling: regular, regular: null };
  }
  const discounted = roundRialUp(decimalOrNull(sale.discountedPrice));
  if (discounted.lessThanOrEqualTo(0) || discounted.greaterThanOrEqualTo(regular)) {
    return { selling: regular, regular: null };
  }
  return { selling: discounted, regular };
}

function decimalOrNull(
  value: Prisma.Decimal | string | number | null | undefined,
): Prisma.Decimal | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  try {
    const parsed = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(String(value));
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}
