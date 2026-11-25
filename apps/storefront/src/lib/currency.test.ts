import { describe, expect, it } from 'vitest';
import {
  TOMAN_LABEL,
  tomanNumber,
  rialBound,
  rialMachineValue,
  rialNumber,
} from './currency';

describe('TOMAN_LABEL', () => {
  it('is the customer-facing unit', () => {
    expect(TOMAN_LABEL).toBe('تومان');
  });
});

describe('tomanNumber', () => {
  it('divides Rial by 10 exactly once', () => {
    expect(tomanNumber('7700000')).toBe(770_000);
    expect(tomanNumber('7650000')).toBe(765_000);
    expect(tomanNumber(null)).toBe(0);
  });
});

describe('rialNumber', () => {
  it('parses server Rial values without conversion or rounding', () => {
    expect(rialNumber('7700000')).toBe(7_700_000);
    expect(rialNumber(16_555_555)).toBe(16_555_555);
    expect(rialNumber(0)).toBe(0);
    expect(rialNumber(null)).toBe(0);
  });
});

describe('rialMachineValue', () => {
  it('emits the server Rial value verbatim', () => {
    expect(rialMachineValue('16000000')).toBe('16000000');
    expect(rialMachineValue('7700000')).toBe('7700000');
  });

  it('keeps fractional values without float artifacts', () => {
    expect(rialMachineValue('155.5')).toBe('155.5');
  });

  it('falls back to zero for invalid input', () => {
    expect(rialMachineValue('not-a-number')).toBe('0');
  });
});

describe('rialBound', () => {
  it('forwards Rial URL bounds unchanged', () => {
    expect(rialBound('2000000')).toBe('2000000');
    expect(rialBound('12.5')).toBe('12.5');
  });

  it('falls back to zero for invalid input', () => {
    expect(rialBound('abc')).toBe('0');
  });
});
