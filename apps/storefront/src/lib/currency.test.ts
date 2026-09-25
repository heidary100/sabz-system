import { describe, expect, it } from 'vitest';
import {
  RIAL_PER_TOMAN,
  rialToToman,
  rialToTomanString,
  tomanToRial,
  tomanToRialString,
} from './currency';

describe('RIAL_PER_TOMAN', () => {
  it('is the fixed contract rate', () => {
    expect(RIAL_PER_TOMAN).toBe(10);
  });
});

describe('rialToToman', () => {
  it('divides by 10 and floors fractional Tomans', () => {
    expect(rialToToman(16_000_000)).toBe(1_600_000);
    expect(rialToToman(16_555_555)).toBe(1_655_555);
    expect(rialToToman(0)).toBe(0);
  });
});

describe('tomanToRial', () => {
  it('multiplies by 10 (exact inverse for whole Tomans)', () => {
    expect(tomanToRial(1_600_000)).toBe(16_000_000);
    expect(tomanToRial(0)).toBe(0);
  });
});

describe('rialToTomanString', () => {
  it('converts API Rial strings to Toman strings', () => {
    expect(rialToTomanString('16000000')).toBe('1600000');
    expect(rialToTomanString('155000000')).toBe('15500000');
  });

  it('keeps fractional Tomans without float artifacts', () => {
    expect(rialToTomanString('15500005')).toBe('1550000.5');
    expect(rialToTomanString('155.5')).toBe('15.55');
  });

  it('falls back to zero for invalid input', () => {
    expect(rialToTomanString('not-a-number')).toBe('0');
  });
});

describe('tomanToRialString', () => {
  it('converts Toman URL bounds to Rial query bounds', () => {
    expect(tomanToRialString('2000000')).toBe('20000000');
    expect(tomanToRialString('12.5')).toBe('125');
    expect(tomanToRialString('0.01')).toBe('0.1');
  });

  it('falls back to zero for invalid input', () => {
    expect(tomanToRialString('abc')).toBe('0');
  });
});
