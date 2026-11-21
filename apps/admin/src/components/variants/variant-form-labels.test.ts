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

  it('offers Rial, USD and AED source currencies with a Rial final price', () => {
    expect(FORM_SOURCE.includes("RIAL: 'ریال'")).toBe(true)
    expect(FORM_SOURCE.includes("USD: 'دلار آمریکا'")).toBe(true)
    expect(FORM_SOURCE.includes("AED: 'درهم امارات'")).toBe(true)
    expect(FORM_SOURCE.includes('قیمت ({CURRENCY_LABELS[values.priceSourceCurrency]})')).toBe(true)
    expect(FORM_SOURCE.includes('قیمت قبل از تخفیف ({CURRENCY_LABELS[values.priceSourceCurrency]})')).toBe(true)
  })

  it('explains the server-side conversion and Rial display contract', () => {
    expect(FORM_SOURCE.includes('نرخ دستی جاری')).toBe(true)
    expect(FORM_SOURCE.includes('فروشگاه فقط ریال نمایش می‌دهد')).toBe(true)
    expect(FORM_SOURCE.includes('قیمت نهایی ریالی پس از تبدیل')).toBe(true)
  })

  it('folds Persian/Arabic digits on money inputs before validation', () => {
    expect(FORM_SOURCE.includes('foldDigitsToEnglish')).toBe(true)
    expect(FORM_SOURCE.includes("key === 'price' || key === 'compareAtPrice'")).toBe(
      true,
    )
  })
})
