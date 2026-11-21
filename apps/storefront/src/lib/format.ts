import { TOMAN_LABEL, rialNumber, tomanNumber } from './currency';

/**
 * Persian display formatting (pricing-grid spec §3).
 *
 * Customer prices arrive from the server as Rial, already rounded UP to
 * 100,000 Rial. The storefront divides by 10 and renders Toman; it never
 * applies its own rounding. Example: 7,650,000 Rial → server rounds to
 * 7,700,000 Rial → this module shows ۷۷۰٬۰۰۰ تومان.
 */

const faIrNumber = new Intl.NumberFormat('fa-IR', {
  maximumFractionDigits: 2,
});

/** Formats a plain number with Persian digits and separators. */
export function formatFaNumber(value: number): string {
  return faIrNumber.format(value);
}

/** Formats a server Rial amount as customer-facing Toman. */
export function formatToman(value: string | number): string {
  return `${faIrNumber.format(tomanNumber(value))} ${TOMAN_LABEL}`;
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
 * Truthful card discount percent (SS-225/SS-900): the drop between the
 * server-rounded regular reference and selling prices. Null when the pair
 * does not describe a real discount — a badge must never invent one, and
 * rounding that makes the values equal removes the badge.
 */
export function salePercentFrom(
  priceFrom: string,
  regularPrice: string | null,
): number | null {
  if (!regularPrice) {
    return null;
  }
  const price = rialNumber(priceFrom);
  const reference = rialNumber(regularPrice);
  if (
    !Number.isFinite(price) ||
    !Number.isFinite(reference) ||
    reference <= 0 ||
    price <= 0 ||
    price >= reference
  ) {
    return null;
  }
  return Math.round(((reference - price) / reference) * 100);
}

/**
 * Persian (Jalali) date/time display with an explicit business timezone.
 * Timestamps stay ISO/UTC in storage and APIs; conversion happens here only.
 */
const faDateFormatter = new Intl.DateTimeFormat('fa-IR', {
  calendar: 'persian',
  timeZone: 'Asia/Tehran',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

export function formatFaDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return faDateFormatter.format(date);
}

const faDateTimeFormatter = new Intl.DateTimeFormat('fa-IR', {
  calendar: 'persian',
  timeZone: 'Asia/Tehran',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatFaDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return faDateTimeFormatter.format(date);
}
