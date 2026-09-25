/**
 * Shared Persian-aware search text normalization (SS-216).
 *
 * These helpers are the TypeScript mirror of the PostgreSQL functions
 * `normalize_fa` / `compact_fa` / `normalize_sku` created in the
 * `ss_216_pg_trgm_search` migration. The two implementations MUST stay
 * behaviorally identical: `apps/api/test/catalog-search.integration-spec.ts`
 * proves exact parity over `NORMALIZE_FA_PARITY_FIXTURES` /
 * `NORMALIZE_SKU_PARITY_FIXTURES` by running the same inputs through
 * `SELECT normalize_fa(...)` etc. and comparing without tolerance.
 *
 * Runtime constraints: no Prisma/NestJS/Next/Node-only APIs — safe for both
 * the NestJS API and the Next.js storefront (browser included).
 *
 * Conventions (following `apps/api/src/modules/products/tags-normalize.ts`):
 * all non-ASCII matching uses explicit \u escapes so invisible characters
 * stay visible in review.
 *
 * Boundary: this is SEARCH normalization — its purpose is maximizing recall
 * while keeping deterministic comparisons. It is deliberately NOT the slug
 * generator (URL identity) and NOT the tag identity `key` (which strips all
 * spaces); the three concerns share rules but not implementations.
 */

/** Maximum catalog-search query length, in user-perceived characters. */
export const MAX_QUERY_GRAPHEMES = 64;

// U+064B-U+0652 Arabic diacritics (fathatan..sukun), U+0670 superscript alef.
const DIACRITICS_PATTERN = /[\u064b-\u0652\u0670]/g;
// U+200E LRM / U+200F RLM directional marks: pure formatting noise, deleted.
const DIRECTIONAL_MARKS_PATTERN = /[\u200e\u200f]/g;
// Separators collapsed to ONE space: any whitespace (JS \s already includes
// U+FEFF) plus U+0085 NEL (PostgreSQL [[:space:]] counts it; JS \s does not —
// added so both sides stay in parity), U+200B ZWSP and U+200C ZWNJ — the
// half-space must behave like a space for search, so گوشی‌موبایل /
// گوشی موبایل / گوشی    موبایل converge.
const SEPARATORS_PATTERN = /[\s\u0085\u200b\u200c\ufeff]+/g;

const ARABIC_YEH = /\u064a/g; // ي
const ARABIC_KAF = /\u0643/g; // ك
const TEH_MARBUTA = /\u0629/g; // ة
const PERSIAN_YEH = '\u06cc'; // ی
const PERSIAN_KAF = '\u06a9'; // ک
const PERSIAN_HEH = '\u0647'; // ه

const PERSIAN_DIGITS_PATTERN = /[\u06f0-\u06f9]/g; // ۰-۹
const ARABIC_DIGITS_PATTERN = /[\u0660-\u0669]/g; // ٠-٩

/**
 * Natural-language search normalization. Order matters and is mirrored in
 * SQL: NFC → diacritics removed → Arabic letters folded to Persian →
 * separators collapsed → Latin lowercased → trimmed.
 *
 * Persian/Arabic digits are deliberately NOT folded here (only the SKU
 * policy folds digits): folding inside product names would merge unrelated
 * model numbers for no observed recall benefit.
 */
export function normalizeFa(raw: unknown): string {
  if (typeof raw !== 'string') {
    return '';
  }
  return raw
    .normalize('NFC')
    .replace(DIACRITICS_PATTERN, '')
    .replace(DIRECTIONAL_MARKS_PATTERN, '')
    .replace(ARABIC_YEH, PERSIAN_YEH)
    .replace(ARABIC_KAF, PERSIAN_KAF)
    .replace(TEH_MARBUTA, PERSIAN_HEH)
    .replace(SEPARATORS_PATTERN, ' ')
    .toLowerCase()
    .trim();
}

/**
 * Compact form: the normalized text with every space removed. Exists to make
 * compound-spelling variants match exactly rather than relying on trigram
 * similarity alone: لپ تاپ / لپ‌تاپ / لپتاپ all compact to لپتاپ. Indexed
 * next to the normalized form (compactFa is applied to both sides of the
 * comparison, never used for display).
 */
export function compactFa(raw: unknown): string {
  return normalizeFa(raw).replace(/ /g, '');
}

/**
 * SKU normalization — intentionally a SEPARATE policy from natural text:
 * separators (- _ . space) are preserved so `SEED-PB-HALO92-BASE` keeps its
 * punctuation semantics, Latin is uppercased, and Persian/Arabic digits fold
 * to ASCII so a SKU typed on a Persian keyboard still matches exactly.
 */
export function normalizeSku(raw: unknown): string {
  if (typeof raw !== 'string') {
    return '';
  }
  return raw
    .normalize('NFC')
    .replace(PERSIAN_DIGITS_PATTERN, (d) =>
      String(d.charCodeAt(0) - 0x06f0),
    )
    .replace(ARABIC_DIGITS_PATTERN, (d) =>
      String(d.charCodeAt(0) - 0x0660),
    )
    .replace(ARABIC_YEH, PERSIAN_YEH)
    .replace(ARABIC_KAF, PERSIAN_KAF)
    .replace(/[\s\u0085]+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Splits a raw query into search tokens on whitespace. ZWNJ is NOT a token
 * boundary — گوشی‌موبایل stays one token so the compact form can match it.
 * Tokens that normalize to nothing (e.g. diacritics-only) are dropped so the
 * SQL builder can never produce a `LIKE '%%'` matches-everything predicate.
 */
export function tokenizeQuery(raw: unknown): string[] {
  if (typeof raw !== 'string') {
    return [];
  }
  return raw
    .split(/\s+/)
    .filter((token) => token.length > 0 && normalizeFa(token) !== '');
}

/**
 * Truncates to at most `max` user-perceived characters without splitting
 * surrogate pairs, combining sequences, or emoji ZWJ sequences.
 *
 * Prefers `Intl.Segmenter` (grapheme clusters; available in every runtime
 * this repo targets — Node >= 16, all evergreen browsers). The fallback is
 * code-point iteration, which never splits surrogate pairs but may split a
 * ZWJ sequence — acceptable only where Segmenter is genuinely unavailable.
 * A code-unit `slice(0, 64)` is never acceptable: it can cut a surrogate
 * pair in half and produce invalid text.
 */
export function truncateQuery(raw: unknown, max: number = MAX_QUERY_GRAPHEMES): string {
  if (typeof raw !== 'string' || max <= 0) {
    return '';
  }
  // Fast path: grapheme count ≤ code-point count ≤ code-unit count, so a
  // string this short can never need truncation.
  if (raw.length <= max) {
    return raw;
  }
  const segmenterFactory = (
    Intl as typeof Intl & { Segmenter?: typeof Intl.Segmenter }
  ).Segmenter;
  if (typeof segmenterFactory === 'function') {
    const segmenter = new segmenterFactory('fa', { granularity: 'grapheme' });
    let out = '';
    let count = 0;
    for (const { segment } of segmenter.segment(raw)) {
      if (count >= max) {
        break;
      }
      out += segment;
      count += 1;
    }
    return out;
  }
  // Fallback: never split surrogate pairs; may split ZWJ sequences.
  return Array.from(raw).slice(0, max).join('');
}

/**
 * Inputs that BOTH the TypeScript helpers and the PostgreSQL functions must
 * normalize identically. Consumed by the packages/search unit tests and by
 * the API SQL↔TS parity integration test — extend both fixtures and both
 * implementations together.
 */
export const NORMALIZE_FA_PARITY_FIXTURES: readonly string[] = [
  '',
  ' ',
  '\u200c',
  'ي',
  'ی',
  'ك',
  'ک',
  'ة',
  'ه',
  'گوشی موبایل',
  'گوشی\u200cموبایل',
  'گوشی    موبایل',
  'لپ تاپ',
  'لپ\u200cتاپ',
  'لپتاپ',
  'سـام\u0651سونگ',
  'مِوس گیمینگ LOGITECH',
  'ORICO هارد اکسترنال',
  '  کیبورد\tمکانیکال\n  ',
  '\ufeffهارد\u200b SSD\u200c',
  '\u200eچپ\u200fراست',
  'ماوس XVI',
  'کد ABC١٢٣',
  'قیمت ۵۰۰۰',
  'HELLO World',
  'A54 5G',
  '🖱️ ماوس گیمینگ',
  '👨\u200d💻 لپ\u200cتاپ',
];

export const NORMALIZE_SKU_PARITY_FIXTURES: readonly string[] = [
  '',
  '  ',
  'SEED-PB-HALO92-BASE',
  'seed-pb-halo92-base',
  'Abc_123.DEF',
  'ABC-۱۲۳',
  'abc٠١٢',
  'a  b',
  '  SSD 970 EVO  ',
  'يک-کد',
  'کد-ك',
];
