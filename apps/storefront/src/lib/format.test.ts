import { describe, expect, it } from 'vitest';
import {
  CALL_FOR_PRICE_LABEL,
  formatCardPrice,
  formatFaNumber,
  formatPriceFrom,
  formatToman,
  normalizeFa,
  salePercentFrom,
} from './format';

describe('formatFaNumber', () => {
  it('formats with Persian digits and separators', () => {
    expect(formatFaNumber(1250000)).toBe('۱٬۲۵۰٬۰۰۰');
    expect(formatFaNumber(0)).toBe('۰');
  });
});

describe('formatToman', () => {
  it('converts API Rial strings ÷10 and formats whole Tomans', () => {
    expect(formatToman('750.5')).toBe('۷۵ تومان');
    expect(formatToman('155000000')).toBe('۱۵٬۵۰۰٬۰۰۰ تومان');
  });

  it('accepts Rial numbers directly', () => {
    expect(formatToman(250000)).toBe('۲۵٬۰۰۰ تومان');
  });

  it('falls back to zero for invalid input', () => {
    expect(formatToman('not-a-number')).toBe('۰ تومان');
  });
});

describe('formatPriceFrom', () => {
  it('prefixes the range marker', () => {
    expect(formatPriceFrom('5000')).toBe('از ۵۰۰ تومان');
  });
});

describe('formatCardPrice', () => {
  it('shows call-for-price when flagged or when no priced minimum exists', () => {
    expect(formatCardPrice('1500', 1, true)).toBe(CALL_FOR_PRICE_LABEL);
    expect(formatCardPrice('', 1, false)).toBe(CALL_FOR_PRICE_LABEL);
  });

  it('shows the exact price for a single priced variant', () => {
    expect(formatCardPrice('1500', 1, false)).toBe('۱۵۰ تومان');
  });

  it('prefixes the range marker only for multi-variant spreads', () => {
    expect(formatCardPrice('1500', 2, false)).toBe('از ۱۵۰ تومان');
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

describe('salePercentFrom', () => {
  it('computes the whole-percent drop from reference to selling price', () => {
    expect(salePercentFrom('13200000', '16500000')).toBe(20);
    expect(salePercentFrom('9900', '10000')).toBe(1);
  });

  it('returns null without a reference price or a real discount', () => {
    expect(salePercentFrom('15000', null)).toBeNull();
    expect(salePercentFrom('15000', '15000')).toBeNull();
    expect(salePercentFrom('15000', '10000')).toBeNull();
    expect(salePercentFrom('15000', 'not-a-number')).toBeNull();
  });
});
