import { describe, expect, it } from 'vitest';
import { formatFaNumber, formatPriceFrom, formatToman } from './format';

describe('formatFaNumber', () => {
  it('formats with Persian digits and separators', () => {
    expect(formatFaNumber(1250000)).toBe('۱٬۲۵۰٬۰۰۰');
    expect(formatFaNumber(0)).toBe('۰');
  });
});

describe('formatToman', () => {
  it('formats decimal-string prices from the API as whole Tomans', () => {
    expect(formatToman('750.5')).toBe('۷۵۰ تومان');
    expect(formatToman('155000000')).toBe('۱۵۵٬۰۰۰٬۰۰۰ تومان');
  });

  it('accepts numbers directly', () => {
    expect(formatToman(250000)).toBe('۲۵۰٬۰۰۰ تومان');
  });

  it('falls back to zero for invalid input', () => {
    expect(formatToman('not-a-number')).toBe('۰ تومان');
  });
});

describe('formatPriceFrom', () => {
  it('prefixes the range marker', () => {
    expect(formatPriceFrom('5000')).toBe('از ۵٬۰۰۰ تومان');
  });
});
