/**
 * Parses the TRUST_PROXY environment variable into a value accepted by
 * Express's `trust proxy` setting.
 *
 * Accepts:
 *   - "true" / "false"  -> boolean (trust all / trust none)
 *   - an integer        -> number of trusted proxy hops (e.g. "1")
 *   - anything else     -> a single proxy specifier (host, subnet, or
 *                          "loopback" / "linklocal" / "uniquelocal")
 *
 * Returns null for blank input so callers can skip configuring the setting.
 */
export function parseTrustProxy(value: string): boolean | number | string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  return trimmed;
}
