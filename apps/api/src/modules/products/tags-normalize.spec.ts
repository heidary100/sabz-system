import { normalizeTagName } from './tags-normalize';

const ZWNJ = String.fromCharCode(0x200c);
const DAMMA = String.fromCharCode(0x064f);
const ARABIC_KAF = String.fromCharCode(0x0643);
const ARABIC_YEH = String.fromCharCode(0x064a);
const PERSIAN_YEH = String.fromCharCode(0x06cc);
const PERSIAN_KAF = String.fromCharCode(0x06a9);

describe('normalizeTagName (SS-203)', () => {
  it('converges Persian spacing variants to one key (dataset: لپ تاپ/لپتاپ)', () => {
    const spaced = normalizeTagName('لپ تاپ')!;
    const joined = normalizeTagName('لپتاپ')!;
    const halfSpaced = normalizeTagName(`لپ${ZWNJ}تاپ`)!;

    expect(spaced.key).toBe('لپتاپ');
    expect(joined.key).toBe('لپتاپ');
    expect(halfSpaced.key).toBe('لپتاپ');
    // Display forms stay distinct (first-seen wins downstream).
    expect(spaced.name).toBe('لپ تاپ');
    expect(halfSpaced.name).toBe(`لپ${ZWNJ}تاپ`);
  });

  it('folds Arabic letters, strips diacritics, lowercases Latin', () => {
    expect(normalizeTagName(`عل${ARABIC_YEH}`)!.key).toBe(`عل${PERSIAN_YEH}`);
    expect(normalizeTagName(`${ARABIC_KAF}ابل`)!.key).toBe(`${PERSIAN_KAF}ابل`);
    expect(normalizeTagName(`م${DAMMA}وبایل`)!.key).toBe('موبایل');
    expect(normalizeTagName('PowerBANK')!).toMatchObject({
      name: 'PowerBANK',
      key: 'powerbank',
    });
  });

  it('trims and collapses whitespace for display', () => {
    expect(normalizeTagName('  گرین   لاین  ')!).toMatchObject({
      name: 'گرین لاین',
      key: 'گرینلاین',
    });
  });

  it('returns null for empty, oversized, keyless, or non-string input', () => {
    expect(normalizeTagName('')).toBeNull();
    expect(normalizeTagName('   ')).toBeNull();
    expect(normalizeTagName(ZWNJ)).toBeNull();
    expect(normalizeTagName(null)).toBeNull();
    expect(normalizeTagName(42)).toBeNull();
    expect(normalizeTagName('x'.repeat(121))).toBeNull();
  });
});
