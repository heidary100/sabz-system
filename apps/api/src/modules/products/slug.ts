import { randomUUID } from 'crypto';

const SLUG_MAX = 255;

/**
 * Persian/Arabic → Latin transliteration table (SS-205, deterministic).
 *
 * Written with explicit \u escapes throughout: Persian letters must stay
 * reviewable and immune to invisible-character corruption. Single-letter
 * mappings except ch/sh/kh/zh/gh. Not reversible and not lossless (ص/س/ث all
 * fold to s) — slugs need stability and readability, not round-tripping.
 * Collisions from folding are resolved by ensureUniqueSlug, never by guessing.
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

/**
 * Transliterate Persian/Arabic characters to Latin. Unknown characters
 * (Latin, digits, spaces, other scripts) pass through untouched for the
 * slug sanitizer downstream.
 */
export function transliteratePersian(value: string): string {
  let out = '';
  for (const char of value) {
    out += TRANSLITERATION[char] ?? char;
  }
  return out;
}

/**
 * Deterministic slug sanitizer: transliterate, lowercase, collapse runs of
 * non-alphanumeric characters to a single hyphen, trim edge hyphens, cap
 * length. Returns '' when nothing slug-worthy survives (caller falls back).
 */
export function slugify(name: string): string {
  return transliteratePersian(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX);
}

/**
 * Deterministic slug generation from a name. No external library.
 * Falls back to a random suffix when the sanitized name is empty.
 */
export function generateSlug(name: string, fallbackPrefix: string): string {
  const slug = slugify(name);
  if (slug.length === 0) {
    return `${fallbackPrefix}-${randomUUID().slice(0, 8)}`;
  }
  return slug;
}

export interface UniqueSlugResult {
  slug: string;
  /** True when a collision suffix (or uuid fallback) was required. */
  suffixed: boolean;
}

/**
 * Collision-safe slug for importer upserts (SS-205): tries the base slug,
 * then base-2..base-100, then a uuid fallback. The `suffixed` flag tells
 * the importer (SS-206) to include the row in its collision report.
 * `exists` answers whether a slug is already taken (any entity kind).
 */
export async function ensureUniqueSlug(
  name: string,
  fallbackPrefix: string,
  exists: (slug: string) => Promise<boolean>,
  maxAttempts = 100,
): Promise<UniqueSlugResult> {
  const base = slugify(name);
  if (base.length === 0) {
    return {
      slug: `${fallbackPrefix}-${randomUUID().slice(0, 8)}`,
      suffixed: true,
    };
  }
  if (!(await exists(base))) {
    return { slug: base, suffixed: false };
  }
  for (let attempt = 2; attempt <= maxAttempts; attempt += 1) {
    const candidate = `${base}-${attempt}`;
    if (!(await exists(candidate))) {
      return { slug: candidate, suffixed: true };
    }
  }
  return {
    slug: `${base}-${randomUUID().slice(0, 8)}`,
    suffixed: true,
  };
}
