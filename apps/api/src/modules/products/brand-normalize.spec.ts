import {
  BRAND_NAME_KEY_FIXTURES,
  brandNameKeys,
  normalizeBrandName,
} from './brand-normalize';

describe('brand identity normalization (SS-258)', () => {
  it('folds Persian spelling and keyboard variants', () => {
    expect(normalizeBrandName('گرين لاين')).toBe('گرین لاین');
    expect(normalizeBrandName('گرین\u200cلاین')).toBe('گرین لاین');
    expect(normalizeBrandName('  گرین   لاین  ')).toBe('گرین لاین');
    expect(normalizeBrandName('سـامسونگ')).toBe('سامسونگ');
    expect(normalizeBrandName('مِوس')).toBe('موس');
  });

  it('folds Latin case and whitespace', () => {
    expect(normalizeBrandName('GREEN LION')).toBe('green lion');
    expect(normalizeBrandName('Portable\tSSD')).toBe('portable ssd');
  });

  it('deliberately preserves digits and punctuation', () => {
    expect(normalizeBrandName('برند ۱۲۳')).toBe('برند ۱۲۳');
    expect(normalizeBrandName('برند 123')).toBe('برند 123');
    expect(normalizeBrandName('برند ۱۲۳')).not.toBe(
      normalizeBrandName('برند 123'),
    );
    expect(normalizeBrandName('T.P-Link')).toBe('t.p-link');
    expect(normalizeBrandName('T.P-Link')).not.toBe(
      normalizeBrandName('T.P Link'),
    );
  });

  it('does not perform automatic transliteration', () => {
    expect(normalizeBrandName('Green Lion')).not.toBe(
      normalizeBrandName('گرین لاین'),
    );
    expect(normalizeBrandName('Apple')).not.toBe(normalizeBrandName('اپل'));
  });

  it('returns null for empty or unusable input', () => {
    expect(normalizeBrandName('')).toBeNull();
    expect(normalizeBrandName('   ')).toBeNull();
    expect(normalizeBrandName('\u200c')).toBeNull();
    expect(normalizeBrandName('\u064b')).toBeNull();
    expect(normalizeBrandName(null)).toBeNull();
    expect(normalizeBrandName(42)).toBeNull();
  });

  it('dedupes a brand whose name and nameEn share a key', () => {
    expect(brandNameKeys('Biva', 'Biva')).toEqual({
      nameKey: 'biva',
      nameEnKey: 'biva',
      keys: ['biva'],
    });
  });

  it('never throws across the shared parity fixtures', () => {
    for (const fixture of BRAND_NAME_KEY_FIXTURES) {
      const key = normalizeBrandName(fixture);
      expect(key === null || typeof key === 'string').toBe(true);
    }
  });
});
