import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * SS-254 wiring gates: all three entity forms must render the shared
 * SlugField, derive the auto suggestion from the current name, keep the
 * submit contract (slug sent only when non-empty, computed from the
 * effective suggestion), and map a late 409 to the field-level message.
 * Source-grep style (variant-form-labels precedent) — the interaction
 * behavior itself is covered by slug-field.test.tsx against real DOM.
 */
const PRODUCT = readFileSync(
  join(import.meta.dirname, '../products/product-editor.tsx'),
  'utf8',
)
const BRAND = readFileSync(
  join(import.meta.dirname, '../brands/brand-form.tsx'),
  'utf8',
)
const CATEGORY = readFileSync(
  join(import.meta.dirname, '../categories/category-editor.tsx'),
  'utf8',
)

describe('slug field wiring (SS-254)', () => {
  for (const [label, source] of [
    ['product-editor', PRODUCT],
    ['brand-form', BRAND],
    ['category-editor', CATEGORY],
  ] as const) {
    it(`${label} renders the shared SlugField`, () => {
      expect(source.includes('<SlugField')).toBe(true)
    })

    it(`${label} starts edit mode in the locked manual state`, () => {
      expect(source.includes("? 'manual' : 'auto'")).toBe(true)
    })

    it(`${label} submits the effective slug only when non-empty`, () => {
      expect(source.includes('effectiveSlug.trim() ? { slug: effectiveSlug.trim() }')).toBe(
        true,
      )
    })

    it(`${label} maps a late 409 to the field-level conflict message`, () => {
      expect(source.includes('isConflictError')).toBe(true)
      expect(source.includes('setSlugConflict(translateApiError(')).toBe(true)
    })

    it(`${label} locks to manual on slug input and regenerates explicitly`, () => {
      expect(source.includes("setSlugMode('manual')")).toBe(true)
      expect(source.includes("setSlugMode('auto')")).toBe(true)
    })
  }

  it('the product form probes collisions through the debounced existing search', () => {
    expect(PRODUCT.includes('useProductSlugCollision')).toBe(true)
  })

  it('the brand form checks against a complete one-shot dataset', () => {
    expect(BRAND.includes('listBrands({ page: 1, limit: COLLISION_DATASET_LIMIT })')).toBe(
      true,
    )
  })

  it('the category form checks against the full tree it already holds', () => {
    expect(CATEGORY.includes('flattenAllNodes(tree)')).toBe(true)
    expect(CATEGORY.includes('findSlugCollision(knownCategorySlugs')).toBe(true)
  })
})
