/**
 * Tag normalization (SS-203).
 *
 * WooCommerce tags are noisy free text with systemic Persian spelling
 * variance (لپ تاپ / لپتاپ / لپ‌تاپ). Instead of a manual alias map, every
 * tag derives a comparison `key`: spaces and zero-width characters stripped,
 * Arabic letters folded to Persian, Latin lowercased, diacritics removed.
 * The display `name` keeps the first-seen original form; the key decides
 * identity (unique constraint → 409-as-skip for the importer).
 *
 * All non-ASCII matching uses explicit \u escapes: invisible characters
 * must stay visible in review.
 */

export interface NormalizedTag {
  /** First-seen display form (trimmed, inner whitespace collapsed). */
  name: string;
  /** Comparison form; tags sharing a key are the same tag. */
  key: string;
}

const NAME_MAX = 120;

// U+200C ZERO WIDTH NON-JOINER, U+200B ZERO WIDTH SPACE, U+FEFF BOM.
const INVISIBLE_PATTERN = /[\u200c\u200b\ufeff\s]+/g;
// Arabic Yeh/Kaf/Teh-Marbuta folded to Persian Yeh/Kaf/Heh.
const ARABIC_YEH = /ي/g;
const ARABIC_KAF = /ك/g;
const ARABIC_TEH_MARBUTA = /ة/g;
const PERSIAN_YEH = 'ی';
const PERSIAN_KAF = 'ک';
const PERSIAN_HEH = 'ه';
// U+064B-U+0652 Arabic diacritics (fathatan to sukun).
const DIACRITICS_PATTERN = /[\u064b-\u0652]/g;

export function normalizeTagName(raw: unknown): NormalizedTag | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length === 0 || name.length > NAME_MAX) {
    return null;
  }
  const key = name
    .replace(INVISIBLE_PATTERN, '')
    .replace(ARABIC_YEH, PERSIAN_YEH)
    .replace(ARABIC_KAF, PERSIAN_KAF)
    .replace(ARABIC_TEH_MARBUTA, PERSIAN_HEH)
    .replace(DIACRITICS_PATTERN, '')
    .toLowerCase();
  if (key.length === 0) {
    return null;
  }
  return { name, key };
}
