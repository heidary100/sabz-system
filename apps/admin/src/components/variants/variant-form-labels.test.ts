import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * SS-250 grep gate (issue #300 oracle): the admin money contract is Rial
 * everywhere. The variant form previously labeled its price fields
 * «تومان» — the exact UI that invites a 10x mispricing (audit 2026-10-24,
 * §A.6-2). These assertions read the source so a regression cannot merge:
 * no «تومان» money label may return to apps/admin, and both price labels
 * must carry «ریال» plus the Rial→Toman display hint.
 */
const FORM_SOURCE = readFileSync(
  join(import.meta.dirname, 'variant-form.tsx'),
  'utf8',
)

describe('variant form money labels (SS-250)', () => {
  it('never labels a price in تومان', () => {
    // The parenthesized-unit pattern is the regression target; the display
    // hint («به تومان (ریال ÷ ۱۰)») legitimately mentions Toman and must stay.
    expect(FORM_SOURCE.includes('(تومان)')).toBe(false)
  })

  it('labels both price fields in ریال', () => {
    expect(FORM_SOURCE.includes('قیمت (ریال)')).toBe(true)
    expect(FORM_SOURCE.includes('قیمت فروش ویژه (ریال)')).toBe(true)
  })

  it('explains the Rial base and the Toman display conversion', () => {
    expect(FORM_SOURCE.includes('مبنا ریال است')).toBe(true)
    expect(FORM_SOURCE.includes('ریال ÷ ۱۰')).toBe(true)
  })

  it('folds Persian/Arabic digits on money inputs before validation', () => {
    expect(FORM_SOURCE.includes('foldDigitsToEnglish')).toBe(true)
    expect(FORM_SOURCE.includes("key === 'price' || key === 'compareAtPrice'")).toBe(
      true,
    )
  })
})
