import { normalizeFa } from '@sabz/search';

/**
 * Brand identity normalization (SS-258).
 *
 * One function is used by admin create/update, the Woo importer, the catalog
 * seed, the merge script and the SQL parity probe. Brand identity deliberately
 * reuses the SS-216 search normalizer (`normalizeFa`) so Persian spelling
 * variations cannot mean different brands, and adds only the brand-specific
 * rule the search normalizer omits: tatweel removal.
 *
 * Deliberately NOT performed:
 * - Persian/Arabic digit folding (`۱۲۳` and `123` stay distinct);
 * - punctuation/hyphen stripping (`T.P-Link` and `T.P Link` stay distinct);
 * - alef/hamza/alef-maksura folding (conservative, avoids false collisions);
 * - full compact form (spaces are preserved as one space);
 * - Persian <-> Latin transliteration or fuzzy matching (cross-language
 *   identity comes only from the curated BrandAlias rows).
 *
 * The PostgreSQL mirror is `brand_name_key(text)` in the SS-258 migration;
 * `brand-name-key.integration-spec.ts` proves exact parity over shared
 * fixtures. Runtime writes persist `normalizeBrandName()` keys, so the SQL
 * function is only an auditable probe and never the read path.
 */
const TATWEEL = /\u0640/g;

export function normalizeBrandName(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const key = normalizeFa(raw).replace(TATWEEL, '');
  return key.length > 0 ? key : null;
}

export interface BrandNameKeys {
  nameKey: string | null;
  nameEnKey: string | null;
  /** Unique non-null keys, in name/nameEn order. */
  keys: string[];
}

/** Keys for a brand's two display names, with within-brand deduplication. */
export function brandNameKeys(
  name: unknown,
  nameEn: unknown,
): BrandNameKeys {
  const nameKey = normalizeBrandName(name);
  const nameEnKey = normalizeBrandName(nameEn);
  const keys = [...new Set([nameKey, nameEnKey].filter((key): key is string => key !== null))];
  return { nameKey, nameEnKey, keys };
}

/**
 * Fixtures shared by the TypeScript unit tests and the SQL parity integration
 * test. Extend both the normalizer and these fixtures together.
 */
export const BRAND_NAME_KEY_FIXTURES: readonly string[] = [
  '',
  ' ',
  '\u200c',
  'گرین لاین',
  'گرين لاين',
  'گرین\u200cلاین',
  '  گرین   لاین  ',
  'سـامسونگ',
  'مِوس',
  'GREEN LION',
  'Green Lion',
  'Portable\tSSD',
  'برند ۱۲۳',
  'برند 123',
  'T.P-Link',
  'T.P Link',
  'آب',
  'اب',
  'Powerology',
  'پاورولوژی',
];
