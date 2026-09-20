/**
 * custom_attributes line parser (SS-202).
 *
 * WooCommerce `custom_attributes` meta is a free-text spec block, one
 * `key: value` pair per line (e.g. `ظرفیت: 1 ترابایت`). This pure function is
 * the parsing contract the importer (SS-206) calls: parseable lines become
 * SPEC assignments with source WOO_CUSTOM; null results are preserved raw in
 * ImportRecord.sourceData and reported, never silently dropped.
 */

export interface ParsedSpecLine {
  key: string;
  value: string;
}

/**
 * Separators between spec keys and values. Colons split anywhere after the
 * first character; dashes only in spaced form so in-word hyphens (e.g.
 * ضد-آب) never split — such lines take the safe null path instead.
 */
const COLON_SEPARATORS = [':', '：'] as const;
const SPACED_DASH_SEPARATORS = [' - ', ' – ', ' — '] as const;

const MAX_KEY_LENGTH = 120;
const MAX_VALUE_LENGTH = 500;

export function parseCustomAttributeLine(line: string): ParsedSpecLine | null {
  if (typeof line !== 'string') {
    return null;
  }
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return null;
  }

  let splitAt = -1;
  let splitLength = 1;
  for (const separator of COLON_SEPARATORS) {
    const at = trimmed.indexOf(separator);
    if (at > 0) {
      splitAt = at;
      splitLength = separator.length;
      break;
    }
  }
  if (splitAt === -1) {
    for (const separator of SPACED_DASH_SEPARATORS) {
      const at = trimmed.indexOf(separator);
      if (at > 0) {
        splitAt = at;
        splitLength = separator.length;
        break;
      }
    }
  }
  if (splitAt === -1) {
    return null;
  }

  const key = trimmed.slice(0, splitAt).trim().replace(/\s+/g, ' ');
  const value = trimmed
    .slice(splitAt + splitLength)
    .trim()
    .replace(/\s+/g, ' ');
  if (key.length === 0 || value.length === 0) {
    return null;
  }
  if (key.length > MAX_KEY_LENGTH || value.length > MAX_VALUE_LENGTH) {
    return null;
  }
  return { key, value };
}
