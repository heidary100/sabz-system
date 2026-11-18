import { Prisma } from '@prisma/client';
import {
  RIAL_ROUNDING_INCREMENT,
  isRoundedRial,
  roundRialUp,
  roundedCompareAt,
} from './rial';

describe('roundRialUp', () => {
  it('rounds the brief example up to the next increment', () => {
    expect(roundRialUp(7_650_000).toString()).toBe('7700000');
    expect(roundRialUp('7650000').toString()).toBe('7700000');
    expect(roundRialUp(new Prisma.Decimal('7650000')).toString()).toBe(
      '7700000',
    );
  });

  it('leaves exact multiples unchanged', () => {
    expect(roundRialUp(7_700_000).toString()).toBe('7700000');
    expect(roundRialUp(100_000).toString()).toBe('100000');
  });

  it('rounds any positive remainder up by one increment', () => {
    expect(roundRialUp(1).toString()).toBe('100000');
    expect(roundRialUp(100_001).toString()).toBe('200000');
  });

  it('preserves the zero/invalid/negative safe path', () => {
    expect(roundRialUp(0).toString()).toBe('0');
    expect(roundRialUp(null).toString()).toBe('0');
    expect(roundRialUp(undefined).toString()).toBe('0');
    expect(roundRialUp(-1).toString()).toBe('0');
    expect(roundRialUp('not-money').toString()).toBe('0');
    expect(roundRialUp('').toString()).toBe('0');
  });

  it('is idempotent', () => {
    const once = roundRialUp(7_650_001);
    expect(roundRialUp(once).toString()).toBe(once.toString());
  });

  it('uses a fixed 100,000 Rial increment', () => {
    expect(RIAL_ROUNDING_INCREMENT).toBe(100_000);
  });
});

describe('isRoundedRial', () => {
  it('recognizes positive exact multiples only', () => {
    expect(isRoundedRial(7_700_000)).toBe(true);
    expect(isRoundedRial(7_650_000)).toBe(false);
    expect(isRoundedRial(0)).toBe(false);
    expect(isRoundedRial('x')).toBe(false);
  });
});

describe('roundedCompareAt', () => {
  it('keeps a real discount after rounding', () => {
    expect(roundedCompareAt(7_650_000, 8_100_000)?.toString()).toBe('8100000');
  });

  it('drops a discount made equal by rounding', () => {
    expect(roundedCompareAt(7_650_000, 7_699_000)).toBeNull();
    expect(roundedCompareAt(7_650_000, 7_650_000)).toBeNull();
  });

  it('drops an invalid comparison', () => {
    expect(roundedCompareAt(0, 100_000)).toBeNull();
    expect(roundedCompareAt(200_000, 100_000)).toBeNull();
  });
});
