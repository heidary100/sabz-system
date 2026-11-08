/**
 * Persian/Arabic-Indic digit folding (SS-260, extracting the existing
 * storefront helper used by the auth screens).
 *
 * Non-digit characters pass through untouched so callers can decide whether
 * separators are valid for their field. National ID validation deliberately
 * rejects them rather than silently stripping them.
 */
const PERSIAN_DIGIT_START = 0x06f0;
const ARABIC_DIGIT_START = 0x0660;

export function toEnglishDigits(value: string): string {
  let out = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= PERSIAN_DIGIT_START && code <= PERSIAN_DIGIT_START + 9) {
      out += String(code - PERSIAN_DIGIT_START);
    } else if (code >= ARABIC_DIGIT_START && code <= ARABIC_DIGIT_START + 9) {
      out += String(code - ARABIC_DIGIT_START);
    } else {
      out += char;
    }
  }
  return out;
}
