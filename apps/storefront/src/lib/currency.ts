/**
 * Storefront currency contract (SS-900).
 *
 * Customers see Rial only. The API is the single authority for customer-facing
 * Rial amounts: it rounds every chargeable/displayed price UP to the next
 * 100,000 Rial inside the pricing pipeline. The storefront formats the
 * server-provided value and never converts or rounds it.
 *
 * This module intentionally exposes no Toman/USD/AED conversion API.
 */

/** The only currency unit rendered to customers. */
export const STOREFRONT_CURRENCY = 'IRR' as const;
export const RIAL_LABEL = 'ریال';

/** Parses a server Decimal-as-string without applying any rounding. */
export function rialNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
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
