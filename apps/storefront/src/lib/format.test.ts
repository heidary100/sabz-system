import { describe, expect, it } from 'vitest';
import {
  CALL_FOR_PRICE_LABEL,
  formatCardPrice,
  formatFaNumber,
  formatPriceFrom,
  formatToman,
  normalizeFa,
} from './format';

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

describe('formatCardPrice', () => {
  it('shows call-for-price when flagged or when no priced minimum exists', () => {
    expect(formatCardPrice('1500', 1, true)).toBe(CALL_FOR_PRICE_LABEL);
    expect(formatCardPrice('', 1, false)).toBe(CALL_FOR_PRICE_LABEL);
  });

  it('shows the exact price for a single priced variant', () => {
    expect(formatCardPrice('1500', 1, false)).toBe('۱٬۵۰۰ تومان');
  });

  it('prefixes the range marker only for multi-variant spreads', () => {
    expect(formatCardPrice('1500', 2, false)).toBe('از ۱٬۵۰۰ تومان');
  });
});

describe('normalizeFa', () => {
  it('folds ZWNJ to a space', () => {
    expect(normalizeFa('لپ‌تاپ')).toBe('لپ تاپ');
  });

  it('folds Arabic ي and ك to Persian ی and ک', () => {
    expect(normalizeFa('علي كالا')).toBe('علی کالا');
  });

  it('folds case, collapses whitespace, and trims', () => {
    expect(normalizeFa('  ANKER   Pro  ')).toBe('anker pro');
  });

  it('returns an empty string for blank input', () => {
    expect(normalizeFa('   ')).toBe('');
  });
});
