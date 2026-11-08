/**
 * Advisory storefront-side Iranian National ID validation (SS-260).
 *
 * The server is authoritative: this mirror exists only for immediate field
 * feedback. A manipulated request still hits the backend validator. The
 * checksum is structural and does not verify identity.
 *
 * The precision policy mirrors the backend: SS-260's product rule requires a
 * non-zero first digit, only `0000000000` is treated as a placeholder, and
 * other checksum-valid repeated sequences are accepted.
 */
import { toEnglishDigits } from '@/lib/digits';

const PLACEHOLDER_VALUES = new Set(['0000000000']);
const NATIONAL_ID_PATTERN = /^[0-9]{10}$/;

export type NationalIdStatus =
  | 'empty'
  | 'invalid_format'
  | 'leading_zero'
  | 'invalid_checksum'
  | 'placeholder'
  | 'valid';

export type NationalIdValidation =
  | { status: 'valid'; value: string }
  | { status: Exclude<NationalIdStatus, 'valid'> };

export const NATIONAL_ID_MESSAGES = {
  label: 'کد ملی',
  helper: 'کد ملی شخصی خود را وارد کنید.',
  disclaimer:
    'این بررسی فقط ساختار کد ملی را می‌سنجد و هویت شما را تأیید نمی‌کند.',
  empty: 'کد ملی نمی‌تواند خالی باشد.',
  invalidFormat: 'کد ملی باید دقیقاً ۱۰ رقم باشد.',
  leadingZero: 'کد ملی نمی‌تواند با صفر شروع شود.',
  invalidChecksum:
    'کد ملی واردشده معتبر نیست؛ رقم کنترل را بررسی کنید.',
  placeholder: 'کد ملی واردشده معتبر نیست.',
  valid: 'قالب کد ملی درست است.',
  saving: 'در حال ذخیره…',
  saved: 'کد ملی ذخیره شد.',
  savedState: 'کد ملی ثبت شده است.',
  unsetState: 'کد ملی ثبت نشده است.',
  change: 'تغییر کد ملی',
  replacementNote: 'کد ملی جدید جایگزین مقدار فعلی می‌شود.',
  cancel: 'انصراف',
  save: 'ذخیره کد ملی',
  networkError: 'خطا در ارتباط با سرور؛ دوباره تلاش کنید.',
  saveFailed: 'کد ملی ذخیره نشد؛ مقدار قبلی حفظ شد.',
} as const;

/** NFC → trim → fold supported digits; other characters are preserved. */
export function normalizeNationalId(value: string): string {
  return toEnglishDigits(value.normalize('NFC').trim());
}

export function validateNationalId(value: string): NationalIdValidation {
  const normalized = normalizeNationalId(value);
  if (normalized === '') {
    return { status: 'empty' };
  }
  if (!NATIONAL_ID_PATTERN.test(normalized)) {
    return { status: 'invalid_format' };
  }
  if (PLACEHOLDER_VALUES.has(normalized)) {
    return { status: 'placeholder' };
  }
  if (normalized.charCodeAt(0) === 0x0030) {
    return { status: 'leading_zero' };
  }

  let sum = 0;
  for (let index = 0; index < 9; index += 1) {
    sum += Number(normalized[index]) * (10 - index);
  }
  const remainder = sum % 11;
  const expected = remainder < 2 ? remainder : 11 - remainder;
  if (Number(normalized[9]) !== expected) {
    return { status: 'invalid_checksum' };
  }
  return { status: 'valid', value: normalized };
}

export function nationalIdMessage(
  status: Exclude<NationalIdStatus, 'valid'>,
): string {
  switch (status) {
    case 'empty':
      return NATIONAL_ID_MESSAGES.empty;
    case 'invalid_checksum':
      return NATIONAL_ID_MESSAGES.invalidChecksum;
    case 'leading_zero':
      return NATIONAL_ID_MESSAGES.leadingZero;
    case 'placeholder':
      return NATIONAL_ID_MESSAGES.placeholder;
    case 'invalid_format':
      return NATIONAL_ID_MESSAGES.invalidFormat;
  }
}
