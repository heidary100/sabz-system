/**
 * Storefront currency contract (pricing-grid spec §3).
 *
 * Backend accounting is integer Rial. The API is the single authority for
 * customer-facing amounts: it rounds every chargeable/displayed price UP to
 * the next 100,000 Rial inside the pricing pipeline. Customers are shown
 * Toman only (10 Rial = 1 Toman), after that authoritative rounding.
 *
 * This module exposes no USD/AED conversion. `rialMachineValue` keeps the
 * Rial value for JSON-LD/structured data, while the display helpers divide
 * by 10 exactly once at the render boundary.
 */

/** Machine/accounting currency used by the API. */
export const STOREFRONT_CURRENCY = 'IRR' as const;
/** Customers see Toman only. */
export const TOMAN_LABEL = 'تومان';
export const RIAL_PER_TOMAN = 10;

/** Parses a server Decimal-as-string without applying any rounding. */
export function rialNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

/**
 * Rial → Toman at the display boundary. The server already rounded UP in
 * Rial, so this never rounds: 7,700,000 Rial → 770,000 Toman.
 */
export function tomanNumber(value: string | number | null | undefined): number {
  return rialNumber(value) / RIAL_PER_TOMAN;
}

/** Machine-readable Rial string for JSON-LD/OG (no conversion). */
export function rialMachineValue(value: string | number): string {
  const number = rialNumber(value);
  return Number.isInteger(number)
    ? String(number)
    : String(Number(number.toFixed(2)));
}

/**
 * URL price bounds are Rial and are forwarded unchanged. Invalid input becomes
 * '0' at the API boundary (a value the API validates as an empty result).
 */
export function rialBound(value: string): string {
  const number = rialNumber(value);
  return Number.isFinite(number) ? String(number) : '0';
}
