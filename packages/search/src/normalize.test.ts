import { describe, expect, it } from 'vitest';
import {
  MAX_QUERY_GRAPHEMES,
  compactFa,
  normalizeFa,
  normalizeSku,
  tokenizeQuery,
  truncateQuery,
} from './normalize';

describe('normalizeFa', () => {
  it('returns empty string for non-string input', () => {
    expect(normalizeFa(undefined)).toBe('');
    expect(normalizeFa(null)).toBe('');
    expect(normalizeFa(42)).toBe('');
  });

  it('folds Arabic yeh/kaf/teh-marbuta to Persian forms', () => {
    expect(normalizeFa('\u064a')).toBe(normalizeFa('\u06cc'));
    expect(normalizeFa('\u0643')).toBe(normalizeFa('\u06a9'));
    expect(normalizeFa('\u0629')).toBe('\u0647');
  });

  it('makes space/ZWNJ/multi-space variants equivalent', () => {
    const forms = [
      '\u06af\u0648\u0634\u06cc \u0645\u0648\u0628\u0627\u06cc\u0644',
      '\u06af\u0648\u0634\u06cc\u200c\u0645\u0648\u0628\u0627\u06cc\u0644',
      '\u06af\u0648\u0634\u06cc    \u0645\u0648\u0628\u0627\u06cc\u0644',
    ];
    expect(new Set(forms.map(normalizeFa)).size).toBe(1);
  });

  it('strips Arabic diacritics and the superscript alef', () => {
    expect(normalizeFa('\u0633\u064e\u0627\u0645\u0652\u0633\u0648\u0646\u06af')).toBe(
      normalizeFa('\u0633\u0627\u0645\u0633\u0648\u0646\u06af'),
    );
    expect(normalizeFa('\u0645\u0646\u0650\u06cc')).toBe(
      normalizeFa('\u0645\u0646\u06cc'),
    );
    expect(normalizeFa('\u0647\u0670')).toBe('\u0647');
  });

  it('removes directional marks and zero-width noise', () => {
    expect(normalizeFa('\u200e\u0627\u200f\u0628')).toBe(
      normalizeFa('\u0627\u0628'),
    );
    expect(normalizeFa('\ufeff\u0647\u200b\u0627\u0631\u062f\u200c')).toBe(
      // ZWSP is a word separator: it becomes a space, it is not deleted.
      '\u0647 \u0627\u0631\u062f',
    );
  });

  it('lowercases Latin and trims', () => {
    expect(normalizeFa('  ORICO SSD  ')).toBe('orico ssd');
  });

  it('keeps Persian and Arabic digits (digits folding is a SKU policy)', () => {
    expect(normalizeFa('\u06f5')).toBe('\u06f5');
    expect(normalizeFa('\u0663')).toBe('\u0663');
  });

  it('normalizes to NFC', () => {
    // NFC composes alef + combining maddah above (U+0653, NOT in the
    // diacritics strip range) into U+0622; both spellings must converge.
    expect(normalizeFa('\u0622')).toBe(normalizeFa('\u0627\u0653'));
  });
});

describe('compactFa', () => {
  it('removes all spaces from the normalized form', () => {
    expect(compactFa('\u0644\u067e \u062a\u0627\u067e')).toBe(
      '\u0644\u067e\u062a\u0627\u067e',
    );
    expect(compactFa('\u0644\u067e\u200c\u062a\u0627\u067e')).toBe(
      compactFa('\u0644\u067e\u062a\u0627\u067e'),
    );
    expect(compactFa('\u06af\u0648\u0634\u06cc\u200c\u0645\u0648\u0628\u0627\u06cc\u0644')).toBe(
      compactFa('\u06af\u0648\u0634\u06cc\u0645\u0648\u0628\u0627\u06cc\u0644'),
    );
  });

  it('is empty for empty input', () => {
    expect(compactFa('')).toBe('');
    expect(compactFa('   ')).toBe('');
  });
});

describe('normalizeSku', () => {
  it('preserves separators and uppercases Latin', () => {
    expect(normalizeSku('seed-pb-halo92-base')).toBe('SEED-PB-HALO92-BASE');
    expect(normalizeSku('Abc_123.DEF')).toBe('ABC_123.DEF');
    expect(normalizeSku('  SSD 970 EVO  ')).toBe('SSD 970 EVO');
  });

  it('folds Persian and Arabic digits to ASCII', () => {
    expect(normalizeSku('ABC-\u06f1\u06f2\u06f3')).toBe('ABC-123');
    expect(normalizeSku('abc\u0660\u0661\u0662')).toBe('ABC012');
  });

  it('folds Arabic yeh/kaf but keeps punctuation', () => {
    expect(normalizeSku('\u06cc-\u06a9')).toBe(normalizeSku('\u064a-\u0643'));
    expect(normalizeSku('\u06cc-\u06a9')).toBe('\u06cc-\u06a9'.toUpperCase());
    expect(normalizeSku('a  b')).toBe('A B');
  });

  it('does not reuse the natural-text policy', () => {
    // normalizeFa lowercases and strips separators; the SKU form must not.
    expect(normalizeSku('ab-c')).not.toBe(normalizeFa('ab-c'));
  });
});

describe('tokenizeQuery', () => {
  it('splits on whitespace only (ZWNJ is not a boundary)', () => {
    expect(tokenizeQuery('\u0633\u0627\u0645\u0633\u0648\u0646\u06af SSD')).toEqual([
      '\u0633\u0627\u0645\u0633\u0648\u0646\u06af',
      'SSD',
    ]);
    expect(
      tokenizeQuery('\u06af\u0648\u0634\u06cc\u200c\u0645\u0648\u0628\u0627\u06cc\u0644'),
    ).toEqual(['\u06af\u0648\u0634\u06cc\u200c\u0645\u0648\u0628\u0627\u06cc\u0644']);
  });

  it('drops tokens that normalize to nothing', () => {
    expect(tokenizeQuery('ok \u064e\u064b x')).toEqual(['ok', 'x']);
    expect(tokenizeQuery('\u200c')).toEqual([]);
  });

  it('returns empty for blank or non-string input', () => {
    expect(tokenizeQuery('   ')).toEqual([]);
    expect(tokenizeQuery('')).toEqual([]);
    expect(tokenizeQuery(undefined)).toEqual([]);
  });
});

describe('truncateQuery', () => {
  it('keeps short strings untouched (fast path)', () => {
    expect(truncateQuery('abc', 64)).toBe('abc');
    expect(truncateQuery('', 64)).toBe('');
  });

  it('truncates ASCII to the cap', () => {
    const long = 'a'.repeat(100);
    expect(truncateQuery(long)).toBe('a'.repeat(MAX_QUERY_GRAPHEMES));
  });

  it('does not split surrogate pairs (64 graphemes of 2-code-unit emoji)', () => {
    const emoji = '\u{1F600}'; // 2 UTF-16 code units, 1 grapheme
    const input = emoji.repeat(100);
    const out = truncateQuery(input);
    expect(Array.from(out).length).toBe(64);
    expect(out).toBe(emoji.repeat(64));
  });

  it('does not split emoji ZWJ sequences', () => {
    const family = '\u{1F468}\u200d\u{1F469}\u200d\u{1F467}\u200d\u{1F466}'; // 1 grapheme, 8 code units
    const input = family.repeat(100);
    const out = truncateQuery(input);
    // Every full grapheme cluster survived: no half-sequence at the end.
    const graphemes = [...new Intl.Segmenter('fa', { granularity: 'grapheme' }).segment(out)];
    expect(graphemes.length).toBe(64);
    expect(graphemes.every((g) => g.segment === family)).toBe(true);
  });

  it('does not split combining sequences', () => {
    const letter = '\u0633'; // س
    const marked = letter + '\u0651'; // سّ — 1 grapheme, 2 code points
    const out = truncateQuery(marked.repeat(100));
    const graphemes = [...new Intl.Segmenter('fa', { granularity: 'grapheme' }).segment(out)];
    expect(graphemes.length).toBe(64);
    expect(graphemes.every((g) => g.segment === marked)).toBe(true);
  });

  it('returns empty for invalid input or non-positive cap', () => {
    expect(truncateQuery(undefined)).toBe('');
    expect(truncateQuery('abc', 0)).toBe('');
    expect(truncateQuery('abc', -1)).toBe('');
  });
});
