import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * SS-255 revision wiring gates: the product form must embed the canonical
 * CategoryManager (compact) and the interactive BrandSection — NOT a Select
 * with creation dialogs. The standalone category page must be the same
 * component in page variant.
 */
const EDITOR = readFileSync(
  join(import.meta.dirname, 'product-editor.tsx'),
  'utf8',
)
const PAGE = readFileSync(join(import.meta.dirname, '../../pages/categories-page.tsx'), 'utf8')
const BRAND_FORM = readFileSync(join(import.meta.dirname, '../brands/brand-form.tsx'), 'utf8')

describe('product editor embedded management wiring (SS-255 revision)', () => {
  it('embeds the canonical CategoryManager in compact variant with assignment wiring', () => {
    expect(EDITOR.includes('<CategoryManager')).toBe(true)
    expect(EDITOR.includes('variant="compact"')).toBe(true)
    expect(EDITOR.includes('selectedId={values.categoryId')).toBe(true)
    expect(EDITOR.includes('onSelect={(id) => set(\'categoryId\', id)}')).toBe(true)
    expect(EDITOR.includes('onCreated={handleCategoryCreated}')).toBe(true)
  })

  it('embeds the interactive BrandSection', () => {
    expect(EDITOR.includes('<BrandSection')).toBe(true)
    expect(EDITOR.includes('selectedId={values.brandId')).toBe(true)
    expect(EDITOR.includes('onSelect={(id) => set(\'brandId\', id)}')).toBe(true)
  })

  it('no longer renders Select-based entity pickers or quick-create dialogs', () => {
    expect(EDITOR.includes('QuickCreateDialog')).toBe(false)
    expect(EDITOR.includes('+ برند جدید')).toBe(false)
    expect(EDITOR.includes('+ دسته\u200Cبندی جدید')).toBe(false)
    expect(EDITOR.includes('useBrandOptions')).toBe(false)
    expect(EDITOR.includes('useCategoryOptions')).toBe(false)
  })

  it('the standalone category page is the same CategoryManager in page variant', () => {
    expect(PAGE.includes('<CategoryManager variant="page" />')).toBe(true)
  })

  it('the standalone brand form keeps the nameEn field (SS-255 slice)', () => {
    expect(BRAND_FORM.includes('نام انگلیسی (اختیاری)')).toBe(true)
    expect(BRAND_FORM.includes('nameEn')).toBe(true)
  })
})
