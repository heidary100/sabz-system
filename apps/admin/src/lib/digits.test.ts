import { describe, expect, it } from 'vitest'
import { foldDigitsToEnglish } from './digits'

describe('foldDigitsToEnglish', () => {
  it('folds Persian digits ۰-۹', () => {
    expect(foldDigitsToEnglish('۱۵۰۰')).toBe('1500')
    expect(foldDigitsToEnglish('۵۸۹۰۰۰۰۰۰')).toBe('589000000')
  })

  it('folds Arabic digits ٠-٩', () => {
    expect(foldDigitsToEnglish('٤٥')).toBe('45')
  })

  it('folds mixed Persian/ASCII content positionally', () => {
    expect(foldDigitsToEnglish('1۵a۲')).toBe('15a2')
  })

  it('leaves ASCII digits and non-digits untouched', () => {
    expect(foldDigitsToEnglish('1500.00')).toBe('1500.00')
    expect(foldDigitsToEnglish('abc')).toBe('abc')
  })

  it('handles the empty string', () => {
    expect(foldDigitsToEnglish('')).toBe('')
  })
})
