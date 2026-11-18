import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * SS-250/SS-900 grep gate: the admin money contract is Rial everywhere.
 * The variant form previously invited a 10x mispricing by labeling prices in
 * Toman; the storefront now also displays Rial, so no Toman conversion hint
 * may return to the admin variant form.
 */
const FORM_SOURCE = readFileSync(
  join(import.meta.dirname, 'variant-form.tsx'),
  'utf8',
)

describe('variant form money labels (SS-250)', () => {
  it('never labels a price in تومان', () => {
    expect(FORM_SOURCE.includes('(تومان)')).toBe(false)
    expect(FORM_SOURCE.includes('ریال ÷ ۱۰')).toBe(false)
  })

  it('labels both price fields in ریال', () => {
    expect(FORM_SOURCE.includes('قیمت (ریال)')).toBe(true)
    expect(FORM_SOURCE.includes('قیمت قبل از تخفیف (ریال)')).toBe(true)
  })

  it('explains the Rial base and display unit', () => {
    expect(FORM_SOURCE.includes('مبنا ریال است')).toBe(true)
    expect(FORM_SOURCE.includes('به ریال نمایش می‌دهد')).toBe(true)
  })

  it('folds Persian/Arabic digits on money inputs before validation', () => {
    expect(FORM_SOURCE.includes('foldDigitsToEnglish')).toBe(true)
    expect(FORM_SOURCE.includes("key === 'price' || key === 'compareAtPrice'")).toBe(
      true,
    )
  })
})
