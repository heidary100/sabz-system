/**
 * Personal Iranian National ID (کد ملی) normalization and structural
 * validation (SS-260).
 *
 * This is intentionally NOT the business legal identifier
 * (`Partner.nationalId`, شناسه ملی): the two concepts share a field name but
 * have different meaning and validation rules. Never import this module into
 * partner code.
 *
 * The check digit is a MOD-11 structural check. It does not verify identity,
 * ownership, issuance, legal validity, or authenticity.
 */

export const PERSONAL_NATIONAL_ID_LENGTH = 10;

const PERSIAN_DIGIT_START = 0x06f0;
const ARABIC_DIGIT_START = 0x0660;
const ZERO = 0x0030;
const PERSONAL_NATIONAL_ID_PATTERN = /^[0-9]{10}$/;

/**
 * The only sequence treated as an obvious placeholder. Repeated digits are
 * otherwise allowed when the checksum passes: some real issued numbers are
 * "round" values, so rejecting every repeated sequence would create false
 * negatives. Stricter policy would need an explicit product decision.
 */
const PLACEHOLDER_VALUES = new Set(['0000000000']);

export type PersonalNationalIdError =
  | 'EMPTY'
  | 'FORMAT'
  | 'LEADING_ZERO'
  | 'CHECKSUM'
  | 'PLACEHOLDER';

export type PersonalNationalIdResult =
  | { ok: true; value: string }
  | { ok: false; error: PersonalNationalIdError };

export const PERSONAL_NATIONAL_ID_MESSAGES: Record<
  PersonalNationalIdError,
  string
> = {
  EMPTY: 'کد ملی نمی‌تواند خالی باشد.',
  FORMAT: 'کد ملی باید دقیقاً ۱۰ رقم باشد.',
  LEADING_ZERO: 'کد ملی نمی‌تواند با صفر شروع شود.',
  CHECKSUM: 'کد ملی واردشده معتبر نیست؛ رقم کنترل را بررسی کنید.',
  PLACEHOLDER: 'کد ملی واردشده معتبر نیست.',
};

/**
 * Folds Persian (۰-۹, U+06F0–U+06F9) and Arabic-Indic (٠-٩, U+0660–U+0669)
 * digits to ASCII. Every other character passes through untouched: the
 * contract must not silently strip arbitrary non-digit input.
 */
export function foldDigitsToAscii(input: string): string {
  let out = '';
  for (const char of input) {
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

/**
 * Canonical input form: NFC → trim outer whitespace → fold supported digits.
 * Internal whitespace and separators are preserved so validation can reject
 * them deterministically. Returns null for non-string input.
 */
export function normalizePersonalNationalId(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null;
  }
  return foldDigitsToAscii(input.normalize('NFC').trim());
}

/**
 * Structural validation.
 *
 * SS-260's explicit product rule requires a non-zero first digit. The MOD-11
 * checksum itself does not impose that rule, and some real identifiers do
 * start with zero; this stricter format rule is therefore a product decision,
 * not part of the checksum.
 */
export function validatePersonalNationalId(
  input: unknown,
): PersonalNationalIdResult {
  const value = normalizePersonalNationalId(input);
  if (value === null) {
    return { ok: false, error: 'FORMAT' };
  }
  if (value === '') {
    return { ok: false, error: 'EMPTY' };
  }
  if (!PERSONAL_NATIONAL_ID_PATTERN.test(value)) {
    return { ok: false, error: 'FORMAT' };
  }
  if (PLACEHOLDER_VALUES.has(value)) {
    return { ok: false, error: 'PLACEHOLDER' };
  }
  if (value.charCodeAt(0) === ZERO) {
    return { ok: false, error: 'LEADING_ZERO' };
  }

  let sum = 0;
  for (let index = 0; index < 9; index += 1) {
    sum += (value.charCodeAt(index) - ZERO) * (10 - index);
  }
  const remainder = sum % 11;
  const expected = remainder < 2 ? remainder : 11 - remainder;
  if (value.charCodeAt(9) - ZERO !== expected) {
    return { ok: false, error: 'CHECKSUM' };
  }

  return { ok: true, value };
}

/**
 * Safe display representation: exactly four trailing digits, never the full
 * value. Malformed stored values are masked completely rather than exposing
 * whatever partial data is present.
 */
export function maskPersonalNationalId(
  input: string | null | undefined,
): string | null {
  if (typeof input !== 'string' || input.length === 0) {
    return null;
  }
  if (!PERSONAL_NATIONAL_ID_PATTERN.test(input)) {
    return '****';
  }
  return `****${input.slice(-4)}`;
}
