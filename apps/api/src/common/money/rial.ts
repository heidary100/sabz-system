import { Prisma } from '@prisma/client';

/**
 * Customer-facing Rial rounding contract (SS-900).
 *
 * The catalog persists Rial verbatim. Every amount a customer can see or be
 * charged is rounded UP to the next 100,000 Rial (`ceil(x / 100000) * 100000`)
 * exactly once, in the server pricing pipeline. Frontends format the value;
 * they never apply their own rounding. Decimal math is used to avoid
 * floating-point currency artifacts.
 */
export const RIAL_ROUNDING_INCREMENT = 100_000;

/** Backend accounting is Rial; customers are shown Toman (10 Rial = 1 Toman). */
export const RIAL_PER_TOMAN = 10;

export type MoneyInput = Prisma.Decimal | string | number | null | undefined;

/** Rounds Rial UP to the next 100,000. Zero/invalid/negative → 0. */
export function roundRialUp(value: MoneyInput): Prisma.Decimal {
  if (value === null || value === undefined || value === '') {
    return new Prisma.Decimal(0);
  }
  let amount: Prisma.Decimal;
  try {
    amount = value instanceof Prisma.Decimal
      ? value
      : new Prisma.Decimal(String(value));
  } catch {
    return new Prisma.Decimal(0);
  }
  if (!amount.isFinite() || amount.lessThanOrEqualTo(0)) {
    return new Prisma.Decimal(0);
  }
  return amount
    .div(RIAL_ROUNDING_INCREMENT)
    .ceil()
    .mul(RIAL_ROUNDING_INCREMENT)
    .toDecimalPlaces(0);
}

/** True when the amount is already a positive multiple of the increment. */
export function isRoundedRial(value: MoneyInput): boolean {
  try {
    const amount = value instanceof Prisma.Decimal
      ? value
      : new Prisma.Decimal(String(value ?? ''));
    return (
      amount.isFinite() &&
      amount.greaterThan(0) &&
      amount.mod(RIAL_ROUNDING_INCREMENT).equals(0)
    );
  } catch {
    return false;
  }
}

/**
 * Converts a customer-facing Rial amount to Toman. The input must already be
 * rounded by `roundRialUp`; this helper never rounds. 7,700,000 Rial ->
 * 770,000 Toman (the spec example: 7,650,000 -> 7,700,000 -> 770,000).
 */
export function rialToToman(value: MoneyInput): Prisma.Decimal {
  if (value === null || value === undefined || value === '') {
    return new Prisma.Decimal(0);
  }
  try {
    const amount = value instanceof Prisma.Decimal
      ? value
      : new Prisma.Decimal(String(value));
    if (!amount.isFinite()) {
      return new Prisma.Decimal(0);
    }
    return amount.div(RIAL_PER_TOMAN).toDecimalPlaces(0);
  } catch {
    return new Prisma.Decimal(0);
  }
}

/**
 * Sale validity after rounding (SS-900 / pricing-grid spec §2.5): a displayed
 * discount is honest only when the rounded selling price is strictly below
 * the rounded regular price. Returns null when the pair does not describe a
 * real discount. `selling` is the active discounted price (or regular price
 * when no sale); `regular` is the regular price.
 */
export function roundedRegularPrice(
  selling: MoneyInput,
  regular: MoneyInput,
): Prisma.Decimal | null {
  const sale = roundRialUp(selling);
  const reference = roundRialUp(regular);
  if (sale.lessThanOrEqualTo(0) || reference.lessThanOrEqualTo(sale)) {
    return null;
  }
  return reference;
}

/** Backwards-compatible alias while callers migrate off the old name. */
export const roundedCompareAt = roundedRegularPrice;
