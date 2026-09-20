import { parseCustomAttributeLine } from './attribute-parse';

describe('parseCustomAttributeLine (SS-202)', () => {
  it('parses Persian key: value lines', () => {
    expect(parseCustomAttributeLine('ظرفیت: 1 ترابایت')).toEqual({
      key: 'ظرفیت',
      value: '1 ترابایت',
    });
  });

  it('splits on the first separator only', () => {
    expect(parseCustomAttributeLine('ابعاد: 10 × 20: نسخه دوم')).toEqual({
      key: 'ابعاد',
      value: '10 × 20: نسخه دوم',
    });
  });

  it('accepts full-width colons and spaced dashes', () => {
    expect(parseCustomAttributeLine('وزن：2 کیلوگرم')).toEqual({
      key: 'وزن',
      value: '2 کیلوگرم',
    });
    expect(parseCustomAttributeLine('اتصال - باسیم')).toEqual({
      key: 'اتصال',
      value: 'باسیم',
    });
  });

  it('collapses inner whitespace and trims edges', () => {
    expect(parseCustomAttributeLine('  ظرفیت:  1   ترابایت  ')).toEqual({
      key: 'ظرفیت',
      value: '1 ترابایت',
    });
  });

  it('returns null for unparseable lines (safe path: preserve raw + report)', () => {
    expect(parseCustomAttributeLine('')).toBeNull();
    expect(parseCustomAttributeLine('   ')).toBeNull();
    expect(parseCustomAttributeLine('بدون جداکننده')).toBeNull();
    expect(parseCustomAttributeLine(': بدون کلید')).toBeNull();
    expect(parseCustomAttributeLine('بدون مقدار:')).toBeNull();
    // In-word hyphen must never split.
    expect(parseCustomAttributeLine('ضد-آب')).toBeNull();
  });

  it('returns null for absurd lengths', () => {
    expect(parseCustomAttributeLine(`${'ک'.repeat(121)}: مقدار`)).toBeNull();
    expect(parseCustomAttributeLine(`کلید: ${'م'.repeat(501)}`)).toBeNull();
  });
});
