/**
 * Client-side slug suggestion (SS-254) — a verbatim port of the server
 * slugifier, `apps/api/src/modules/products/slug.ts` (SS-205).
 *
 * Why a port instead of a shared package: the admin must not runtime-import
 * `@sabz/*` packages (they ship a CJS dist that Vite dev serves raw —
 * SS-240A incident), and importing across app trees would break the admin
 * Docker build (only `apps/admin` is baked). Drift is guarded by
 * `slug.test.ts`, whose expected outputs are GENERATED from the server
 * implementation — never hand-written. If the server slugger ever changes,
 * regenerate and review the diff intentionally:
 *
 *   cd apps/api && pnpm exec tsx -e "
 *     import { slugify } from './src/modules/products/slug';
 *     <print slugify for each vector in apps/admin/src/lib/slug.test.ts>"
 *
 * Deliberately absent: the server's random fallbacks (`generateSlug` /
 * `ensureUniqueSlug`). The suggestion is always `slugify(name)`; when it is
 * empty the form omits the slug and the server applies its own fallback, so
 * no crypto and no duplicated randomness live here.
 */

const SLUG_MAX = 255;

/**
 * Persian/Arabic → Latin transliteration table — copied VERBATIM from
 * `apps/api/src/modules/products/slug.ts` (explicit escapes kept for
 * reviewability and invisible-character immunity). Not lossless by design
 * (ص/س/ث→s, ذ/ز/ض/ظ→z, …); collisions are the server's uniqueness problem,
 * surfaced here only as hints.
 */
const TRANSLITERATION: Record<string, string> = {
  // Alef family.
  'ا': 'a',
  'أ': 'a',
  'إ': 'e',
  'آ': 'a',
  // Beh / Peh / Teh / Theh.
  'ب': 'b',
  'پ': 'p',
  'ت': 't',
  'ث': 's',
  // Jeem family.
  'ج': 'j',
  'چ': 'ch',
  'ح': 'h',
  'خ': 'kh',
  // Dal / Thal / Reh / Zeh / Zhad.
  'د': 'd',
  'ذ': 'z',
  'ر': 'r',
  'ز': 'z',
  'ژ': 'zh',
  // Seen / Sheen / Sad / Zad.
  'س': 's',
  'ش': 'sh',
  'ص': 's',
  'ض': 'z',
  // Tah / Zah / Ain / Ghain.
  'ط': 't',
  'ظ': 'z',
  'ع': 'a',
  'غ': 'gh',
  // Feh / Ghaf / Kaf / Gaf.
  'ف': 'f',
  'ق': 'gh',
  'ک': 'k',
  'گ': 'g',
  // Lam / Meem / Noon / Vav / Heh / Yeh.
  'ل': 'l',
  'م': 'm',
  'ن': 'n',
  'و': 'v',
  'ه': 'h',
  'ی': 'y',
  // Arabic Yeh/Kaf folded to Persian before mapping.
  'ي': 'y',
  'ك': 'k',
  // Teh-Marbuta, Hamza forms, Tatweel: dropped or folded.
  'ة': 'h',
  'ء': '',
  'ئ': 'y',
  'ؤ': 'v',
  'ـ': '',
  '‌': '',
  // Persian digits.
  '۰': '0',
  '۱': '1',
  '۲': '2',
  '۳': '3',
  '۴': '4',
  '۵': '5',
  '۶': '6',
  '۷': '7',
  '۸': '8',
  '۹': '9',
};

/** Persian/Arabic characters transliterated; unknown characters pass through. */
export function transliteratePersian(value: string): string {
  let out = '';
  for (const char of value) {
    out += TRANSLITERATION[char] ?? char;
  }
  return out;
}

/**
 * Deterministic slug suggestion: transliterate, lowercase, collapse runs of
 * non-alphanumerics to one hyphen, trim edges, cap length. Byte-identical to
 * the server's `slugify` — pinned by parity fixtures in `slug.test.ts`.
 */
export function slugify(name: string): string {
  return transliteratePersian(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX);
}
