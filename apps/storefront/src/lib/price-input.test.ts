import { describe, expect, it } from 'vitest';
import { sanitizePriceBound } from './price-input';

describe('sanitizePriceBound', () => {
  it('passes through valid API Decimal-as-string bounds', () => {
    expect(sanitizePriceBound('1500000')).toBe('1500000');
    expect(sanitizePriceBound('20000000.50')).toBe('20000000.50');
    expect(sanitizePriceBound('  1000  ')).toBe('1000');
  });

  it('returns empty for empty input (clear that bound)', () => {
    expect(sanitizePriceBound('')).toBe('');
    expect(sanitizePriceBound('   ')).toBe('');
  });

  it('rejects malformed input instead of producing broken URLs', () => {
    expect(sanitizePriceBound('abc')).toBe(null);
    expect(sanitizePriceBound('12.345')).toBe(null);
    expect(sanitizePriceBound('-5')).toBe(null);
    expect(sanitizePriceBound('12..5')).toBe(null);
  });

  it('folds Persian and Arabic digits and strips separators', () => {
    expect(sanitizePriceBound('۱۰٬۰۰۰٬۰۰۰')).toBe('10000000');
    expect(sanitizePriceBound('٢٠٠٠')).toBe('2000');
    expect(sanitizePriceBound('1,000,000')).toBe('1000000');
  });
});
