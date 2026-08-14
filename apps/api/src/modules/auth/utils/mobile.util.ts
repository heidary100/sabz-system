/**
 * Canonical Iranian mobile form: +98 followed by 9 digits.
 *
 * Accepts both "+98912..." and "0912..." input forms and returns the
 * canonical "+98" form so that Redis rate-limit keys, database records, and
 * audit entries are always derived from a single representation. Different
 * input formats of the same number must not bypass rate limits.
 */
export function normalizeMobile(mobile: string): string {
  if (typeof mobile !== 'string') {
    return mobile;
  }
  return mobile.startsWith('0') ? `+98${mobile.slice(1)}` : mobile;
}
