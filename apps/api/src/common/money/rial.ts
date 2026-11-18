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
 * Sale validity after rounding (SS-900): a displayed discount is honest only
 * when the rounded selling price is strictly below the rounded reference.
 * Returns null when the pair does not describe a real discount.
 */
export function roundedCompareAt(
  price: MoneyInput,
  compareAt: MoneyInput,
): Prisma.Decimal | null {
  const selling = roundRialUp(price);
  const reference = roundRialUp(compareAt);
  if (selling.lessThanOrEqualTo(0) || reference.lessThanOrEqualTo(selling)) {
    return null;
  }
  return reference;
}
