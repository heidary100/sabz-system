/**
 * Persian/Arabic digit folding (SS-250).
 *
 * Admin money inputs are validated against an ASCII pattern, but Persian
 * keyboards emit ۰-۹ (U+06F0–U+06F9) and Arabic keyboards ٠-٩ (U+0660–U+0669).
 * Folding to ASCII digits at input time lets those keystrokes validate
 * normally instead of dying in a Persian error message. Non-digit
 * characters pass through untouched.
 */

const PERSIAN_START = 0x06f0
const ARABIC_START = 0x0660

export function foldDigitsToEnglish(value: string): string {
  let out = ''
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code >= PERSIAN_START && code <= PERSIAN_START + 9) {
      out += String(code - PERSIAN_START)
    } else if (code >= ARABIC_START && code <= ARABIC_START + 9) {
      out += String(code - ARABIC_START)
    } else {
      out += char
    }
  }
  return out
}
