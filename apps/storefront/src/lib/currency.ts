/**
 * Storefront currency conversion (SS-222, client decision 2026-09-25).
 *
 * The catalog API persists Rial verbatim (SS-207 "O-1"), while every
 * storefront surface presents Toman (milestone contract Decision 1). The
 * ÷10 / ×10 lives HERE and nowhere else: presentation helpers divide,
 * the query-bound serializer multiplies. The admin app keeps operating in
 * Rial; the storefront is the only Toman surface.
 */

export const RIAL_PER_TOMAN = 10;

/** API Rial → presentation Toman (floored; retail prices are whole Tomans). */
export function rialToToman(rial: number): number {
  return Math.floor(rial / RIAL_PER_TOMAN);
}

/** Presentation Toman → API Rial bound. */
export function tomanToRial(toman: number): number {
  return toman * RIAL_PER_TOMAN;
}

/**
 * API Decimal-as-string Rial → Toman string for JSON-LD/OG offers, so the
 * machine-readable price always equals the visible Toman price. Fractional
 * Tomans keep up to 2 decimals without float artifacts ('15500005' →
 * '1550000.5').
 */
export function rialToTomanString(rial: string): string {
  const value = Number(rial);
  if (!Number.isFinite(value)) {
    return '0';
  }
  const toman = value / RIAL_PER_TOMAN;
  return Number.isInteger(toman) ? String(toman) : String(Number(toman.toFixed(2)));
}

/**
 * Toman URL bound (`priceFrom`/`priceTo`) → Rial query bound. Returns a
 * Decimal-safe string; invalid input becomes '0' (callers never send
 * invalid bounds, but the API boundary must not emit NaN).
 */
export function tomanToRialString(toman: string): string {
  const value = Number(toman);
  if (!Number.isFinite(value)) {
    return '0';
  }
  return String(Number((value * RIAL_PER_TOMAN).toFixed(2)));
}
