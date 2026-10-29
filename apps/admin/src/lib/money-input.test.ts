import { describe, expect, it } from 'vitest'
import {
  applyMoneyInput,
  groupMoneyDigits,
  restoreMoneyCaret,
  sanitizeMoneyInput,
  stripMoneyGrouping,
} from './money-input'

describe('money input grouping (SS-265)', () => {
  it('groups the integer part at three, six, nine … digit boundaries', () => {
    expect(groupMoneyDigits('')).toBe('')
    expect(groupMoneyDigits('5')).toBe('5')
    expect(groupMoneyDigits('500')).toBe('500')
    expect(groupMoneyDigits('1500')).toBe('1,500')
    expect(groupMoneyDigits('1500000')).toBe('1,500,000')
    expect(groupMoneyDigits('123456789')).toBe('123,456,789')
    expect(groupMoneyDigits('1234567890')).toBe('1,234,567,890')
  })

  it('keeps the decimal part ungrouped', () => {
    expect(groupMoneyDigits('1500.00')).toBe('1,500.00')
    expect(groupMoneyDigits('0.5')).toBe('0.5')
    expect(groupMoneyDigits('.5')).toBe('.5')
    expect(groupMoneyDigits('1500.')).toBe('1,500.')
  })

  it('sanitizes to the canonical state: folds digits, drops commas and junk', () => {
    expect(sanitizeMoneyInput('1,500')).toBe('1500')
    expect(sanitizeMoneyInput('۱٬۵۰۰')).toBe('1500')
    expect(sanitizeMoneyInput('۱۵۰۰.۵۰')).toBe('1500.50')
    expect(sanitizeMoneyInput('12a3.4.5')).toBe('123.45')
    expect(sanitizeMoneyInput('abc')).toBe('')
    expect(stripMoneyGrouping('1,500.00')).toBe('1500.00')
  })

  it('formats and maps the caret for plain typing at the end', () => {
    expect(applyMoneyInput('1500000', 7)).toEqual({
      state: '1500000',
      display: '1,500,000',
      caret: 9,
    })
    expect(applyMoneyInput('', 0)).toEqual({ state: '', display: '', caret: 0 })
  })

  it('maps the caret across regrouping for mid-number edits', () => {
    // Caret after "5" in 1,5|00,000; typing 9 yields 15,9|00,000 — the caret
    // must stay right after the typed digit, not jump to the end.
    expect(applyMoneyInput('1,5900,000', 4)).toEqual({
      state: '15900000',
      display: '15,900,000',
      caret: 4,
    })
  })

  it('maps the caret for backspace over a digit mid-number', () => {
    // Caret after "5" in 1,5|00,000; backspace yields 1|00,000.
    expect(applyMoneyInput('1,00,000', 2)).toEqual({
      state: '100000',
      display: '100,000',
      caret: 1,
    })
  })

  it('counts folded Persian digits for the caret mapping', () => {
    expect(applyMoneyInput('۱۵۰', 3)).toEqual({
      state: '150',
      display: '150',
      caret: 3,
    })
  })

  it('keeps a trailing dot and its caret position', () => {
    expect(applyMoneyInput('1500.', 5)).toEqual({
      state: '1500.',
      display: '1,500.',
      caret: 6,
    })
  })

  it('clamps the caret to the display end for out-of-range input', () => {
    expect(applyMoneyInput('1500', 99).caret).toBe(5)
  })

  it('restoreMoneyCaret is a no-op-safe DOM helper (does not throw detached)', () => {
    // queueMicrotask-based; just verify it schedules without throwing and
    // tolerates an element detached from any document.
    expect(() => restoreMoneyCaret({ isConnected: false } as unknown as HTMLInputElement, 0)).not.toThrow()
  })
})
