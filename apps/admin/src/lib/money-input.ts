/**
 * Thousands grouping for admin money inputs (SS-265).
 *
 * Display-only concern: component state keeps the CANONICAL raw value the
 * API contract requires (`PRICE_12_2_PATTERN` ASCII digits + optional dot),
 * while the input shows `1,500,000`-style grouping so Rial amounts stay
 * readable at catalog scale. The grouping character is `,` with English
 * digits — consistent with the existing LTR money inputs and the SS-250
 * fold-to-English contract (Persian/Arabic digits fold at input time).
 *
 * Deliberately NOT applied to percent inputs (discount/tier), product
 * dimensions (small decimals), or the storefront price range filter (a
 * query parameter, not a data-entry amount).
 */

import { foldDigitsToEnglish } from './digits'

/**
 * Canonical state for a money input: fold Persian/Arabic digits, drop
 * grouping commas and every non-money character, keep digits and the first
 * dot. Junk keystrokes therefore disappear instead of poisoning the value —
 * pattern errors (max 2 decimals, max 10 integer digits) still surface on
 * submit for values that survive.
 */
export function sanitizeMoneyInput(value: string): string {
  let out = ''
  let dotSeen = false
  for (const char of foldDigitsToEnglish(value)) {
    if (char >= '0' && char <= '9') {
      out += char
    } else if (char === '.' && !dotSeen) {
      out += char
      dotSeen = true
    }
  }
  return out
}

/** Group the integer part by thousands: `1500000` → `1,500,000`. */
export function groupMoneyDigits(value: string): string {
  const dot = value.indexOf('.')
  const intPart = dot === -1 ? value : value.slice(0, dot)
  const rest = dot === -1 ? '' : value.slice(dot)
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return grouped + rest
}

/** Remove display grouping: `1,500.00` → `1500.00`. */
export function stripMoneyGrouping(value: string): string {
  return foldDigitsToEnglish(value).replace(/,/g, '')
}

export interface MoneyInputResult {
  /** Canonical value to store in component state (what gets submitted). */
  state: string
  /** Grouped display string (equals `groupMoneyDigits(state)`). */
  display: string
  /** Caret position inside `display` preserving the edit point. */
  caret: number
}

/**
 * Pure core of a money input's onChange. Digits and dots are "significant";
 * commas are display-only, so the caret is remapped by counting significant
 * characters before it and re-walking the regrouped display — typing or
 * deleting mid-number never jumps the caret to the end.
 */
export function applyMoneyInput(rawInput: string, caret: number): MoneyInputResult {
  const state = sanitizeMoneyInput(rawInput)
  const display = groupMoneyDigits(state)

  const significant = (char: string): boolean => (char >= '0' && char <= '9') || char === '.'
  let beforeCaret = 0
  for (const char of foldDigitsToEnglish(rawInput).slice(0, Math.max(caret, 0))) {
    if (significant(char)) {
      beforeCaret += 1
    }
  }
  if (beforeCaret === 0) {
    return { state, display, caret: 0 }
  }

  let seen = 0
  let position = 0
  for (const char of display) {
    position += 1
    if (significant(char)) {
      seen += 1
    }
    if (seen === beforeCaret) {
      break
    }
  }
  return { state, display, caret: seen < beforeCaret ? display.length : position }
}

/**
 * Restore the caret after React commits the reformatted value. React flushes
 * discrete input events before microtasks run, so a queued `setSelectionRange`
 * lands on the committed DOM.
 */
export function restoreMoneyCaret(element: HTMLInputElement, caret: number): void {
  queueMicrotask(() => {
    if (element.isConnected) {
      element.setSelectionRange(caret, caret)
    }
  })
}
