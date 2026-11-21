/**
 * Canonical public storefront origin for admin links (SS-900 Part II).
 *
 * Production deployments must set `VITE_STOREFRONT_URL`. The development
 * fallback matches the Compose storefront port; it is never used to construct
 * a published link outside a development build without an explicit override.
 */
export const STOREFRONT_URL = (
  import.meta.env.VITE_STOREFRONT_URL ?? 'http://localhost:3002'
).replace(/\/+$/, '')

export function storefrontProductUrl(slug: string): string {
  return `${STOREFRONT_URL}/products/${encodeURIComponent(slug)}`
}

/** Resolve a validated chat context URL to the public storefront origin. */
export function storefrontContextUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const parsed = new URL(value, `${STOREFRONT_URL}/`)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (parsed.origin !== new URL(STOREFRONT_URL).origin) return null
    return parsed.toString()
  } catch {
    return null
  }
}
