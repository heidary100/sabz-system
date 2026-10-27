/**
 * Client-side slug collision hint (SS-254).
 *
 * Pure matcher against entity rows the relevant form already has (or, for
 * products, a debounced search subset — see product-editor). Honesty rules:
 *
 * - Server uniqueness is exact on the slug column (`@unique`), so the match
 *   is exact string equality — not normalized, not case-folded.
 * - The hint only ever WARNS when a collision is found. An empty result
 *   never claims availability: brand/category datasets are complete today
 *   but capped at 100 rows, and the product dataset is a search subset that
 *   can silently hide a match. There is deliberately no "available" UI.
 * - The backend stays authoritative: a collision that escapes the hint
 *   surfaces as HTTP 409, mapped to a field-level message by the forms.
 */
export interface SlugRow {
  id: string
  slug: string
}

export function findSlugCollision<T extends SlugRow>(
  rows: readonly T[],
  proposed: string,
  excludeId?: string,
): T | null {
  const candidate = proposed.trim()
  if (candidate === '') {
    return null
  }
  return (
    rows.find((row) => row.slug === candidate && row.id !== excludeId) ?? null
  )
}
