/**
 * Client-side SKU suggestion (SS-256) — an opaque, stable, collision-
 * resistant identifier, deliberately name-INDEPENDENT.
 *
 * Why opaque instead of derived from nameEn/model text: 46% of the live
 * catalog already carries synthetic `WOO-<sourceId>` SKUs, `nameEn` is
 * absent from the seed catalog and unvetted (mixed junk) in the WooCommerce
 * source, and product names are not unique. A name-derived suggestion would
 * need client-side collision suffixing against data the form cannot fully
 * see (it only knows the current product's variants). A name-independent one
 * makes "manual input is never overwritten" structural: nothing ever
 * regenerates the value except the form's explicit regenerate affordance,
 * which hides the moment the field is touched.
 *
 * Uniqueness stays the server's job: the `ProductVariant_sku_key` unique
 * index arbitrates races and the API maps the violation to HTTP 409, which
 * the variant form shows as a Persian message. The suggestion is ephemeral
 * client text; once submitted it is an ordinary SKU that nothing rewrites.
 *
 * Format: `SBZ-` + 8 chars from a 30-symbol unambiguous alphabet (no
 * I/L/O/U/0/1 — safe to read aloud and retype). 30^8 ≈ 6.6e11; expected
 * collisions at 10k variants ≈ 8e-5, and an escape is a recoverable 409.
 * Casing and the hyphen match the existing synthetic prefixes (`WOO-`,
 * `SEED-`).
 */

const SKU_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'

// 240 = 30 × 8: bytes below this map uniformly onto the 30-symbol alphabet
// via modulo; the 16 values at/above are rejected and redrawn.
const REJECTION_CEILING = 240
const RANDOM_PART_LENGTH = 8
const MAX_DRAW_ATTEMPTS = 100

export type SkuRandomSource = (byteCount: number) => Uint8Array

function defaultRandomSource(byteCount: number): Uint8Array {
  const bytes = new Uint8Array(byteCount)
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}

/**
 * Deterministic for a fixed `randomSource`. Draws one byte per character,
 * rejecting values ≥ 240 so `byte % 30` is uniform. Bounded: a source that
 * never yields an acceptable byte throws after `MAX_DRAW_ATTEMPTS` draws per
 * character instead of hanging — keeps pathological behavior testable.
 */
export function suggestSku(
  randomSource: SkuRandomSource = defaultRandomSource,
): string {
  let suffix = ''
  for (let position = 0; position < RANDOM_PART_LENGTH; position += 1) {
    let drawn = false
    for (let attempt = 1; attempt <= MAX_DRAW_ATTEMPTS; attempt += 1) {
      const byte = randomSource(1)[0]
      if (byte === undefined) {
        throw new Error('sku-suggestion: random source returned no bytes')
      }
      if (byte < REJECTION_CEILING) {
        suffix += SKU_ALPHABET.charAt(byte % SKU_ALPHABET.length)
        drawn = true
        break
      }
    }
    if (!drawn) {
      throw new Error(
        'sku-suggestion: random source exhausted the draw budget (rejection ceiling never met)',
      )
    }
  }
  return `SBZ-${suffix}`
}
