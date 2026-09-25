import { rialToToman } from './currency';

/**
 * Persian display formatting (Decision 1: prices present as Toman, fa-IR
 * numerals). The API persists Rial verbatim (SS-207 "O-1"), so every
 * presentation helper converts ÷10 through `lib/currency.ts` — the single
 * conversion point (SS-222). Pure helpers — no API or React dependencies.
 */

const faIrNumber = new Intl.NumberFormat('fa-IR');

/** Formats a plain number with Persian digits and separators. */
export function formatFaNumber(value: number): string {
  return faIrNumber.format(value);
}

/**
 * Formats a catalog price for display: API Rial → Toman (÷10), Persian
 * numerals with thousand separators, followed by the تومان unit. The API
 * serializes `Decimal` values as strings ('750.5'); the fractional part —
 * always zero after conversion in retail prices — is dropped.
 */
export function formatToman(value: string | number): string {
  const rial = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(rial)) {
    return formatToman(0);
  }
  return `${faIrNumber.format(rialToToman(rial))} تومان`;
}

/** «از ۲۵۰٬۰۰۰ تومان» — used on listing cards with multiple variants. */
export function formatPriceFrom(value: string | number): string {
  return `از ${formatToman(value)}`;
}

/** Call-for-price label (SS-201, Q1): published but non-purchasable rows. */
export const CALL_FOR_PRICE_LABEL = 'تماس بگیرید';

/**
 * Normalizes Persian text for local facet matching (SS-212 only — not the
 * SS-216 global search normalizer): ZWNJ becomes a space, Arabic ي/ك fold to
 * Persian ی/ک, case folds, whitespace collapses, ends trim.
 */
export function normalizeFa(value: string): string {
  return value
    .replace(/[\u200C\u200D]/g, ' ')
    .replace(/[ي]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Listing-card price line (SS-201). Call-for-price whenever the API says so
 * (or no priced minimum exists); exact price for a single priced variant;
 * «از …» only for genuine multi-variant spreads.
 */
export function formatCardPrice(
  priceFrom: string,
  variantCount: number,
  callForPrice: boolean,
): string {
  if (callForPrice || priceFrom === '') {
    return CALL_FOR_PRICE_LABEL;
  }
  return variantCount > 1 ? formatPriceFrom(priceFrom) : formatToman(priceFrom);
}

/**
 * Truthful card discount percent (SS-225): the drop from the reference
 * (compare-at) price to the selling price of the same variant, rounded to a
 * whole percent. Null when there is no reference price or the pair does not
 * describe a real discount — a badge must never invent one.
 */
export function salePercentFrom(
  priceFrom: string,
  compareAtPrice: string | null,
): number | null {
  if (!compareAtPrice) {
    return null;
  }
  const price = Number(priceFrom);
  const reference = Number(compareAtPrice);
  if (
    !Number.isFinite(price) ||
    !Number.isFinite(reference) ||
    reference <= 0 ||
    price >= reference
  ) {
    return null;
  }
  return Math.round(((reference - price) / reference) * 100);
}
