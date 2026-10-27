import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * SS-255 wiring gates: the product form must render both quick-create
 * dialogs, refresh its options BEFORE selecting the created entity, close
 * the dialog only after both, and never touch any other form field.
 */
const EDITOR = readFileSync(
  join(import.meta.dirname, 'product-editor.tsx'),
  'utf8',
)

describe('product editor inline-create wiring (SS-255)', () => {
  it('renders both quick-create dialogs', () => {
    expect(EDITOR.includes('<BrandQuickCreateDialog')).toBe(true)
    expect(EDITOR.includes('<CategoryQuickCreateDialog')).toBe(true)
  })

  it('exposes both inline triggers', () => {
    expect(EDITOR.includes('+ برند جدید')).toBe(true)
    expect(EDITOR.includes('+ دسته\u200Cبندی جدید')).toBe(true)
  })

  it('awaits the options refetch BEFORE selecting the created entity', () => {
    expect(EDITOR.includes('await refetchBrands()')).toBe(true)
    expect(EDITOR.includes('await refetchCategories()')).toBe(true)
    const brandHandler = EDITOR.slice(
      EDITOR.indexOf('handleBrandCreated'),
      EDITOR.indexOf('handleCategoryCreated'),
    )
    expect(brandHandler.indexOf('await refetchBrands()')).toBeLessThan(
      brandHandler.indexOf("set('brandId'"),
    )
    expect(brandHandler.indexOf("set('brandId'")).toBeLessThan(
      brandHandler.indexOf('setBrandDialogOpen(false)'),
    )
  })

  it('closes the dialog only after selection', () => {
    const categoryHandler = EDITOR.slice(EDITOR.indexOf('handleCategoryCreated'))
    expect(categoryHandler.indexOf("set('categoryId'")).toBeLessThan(
      categoryHandler.indexOf('setCategoryDialogOpen(false)'),
    )
  })
})
