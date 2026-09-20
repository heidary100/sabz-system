/**
 * Persian display formatting (Decision 1: all prices are Toman, fa-IR
 * numerals). Pure helpers — no API or React dependencies.
 */

const faIrNumber = new Intl.NumberFormat('fa-IR');

/** Formats a plain number with Persian digits and separators. */
export function formatFaNumber(value: number): string {
  return faIrNumber.format(value);
}

/**
 * Formats a catalog price (Toman) for display: Persian numerals with
 * thousand separators, followed by the تومان unit. The API serializes
 * `Decimal` values as strings ('750.5'), so the fractional part — always
 * zero in Toman retail prices — is dropped.
 */
export function formatToman(value: string | number): string {
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(numeric)) {
    return formatToman(0);
  }
  return `${faIrNumber.format(Math.floor(numeric))} تومان`;
}

/** «از ۲۵۰٬۰۰۰ تومان» — used on listing cards with multiple variants. */
export function formatPriceFrom(value: string | number): string {
  return `از ${formatToman(value)}`;
}

/** Call-for-price label (SS-201, Q1): published but non-purchasable rows. */
export const CALL_FOR_PRICE_LABEL = 'تماس بگیرید';

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
