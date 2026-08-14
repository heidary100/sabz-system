import { normalizeMobile } from './mobile.util';

describe('normalizeMobile', () => {
  it('keeps a number already in +98 form unchanged', () => {
    expect(normalizeMobile('+989123456789')).toBe('+989123456789');
  });

  it('converts a leading-zero number to the +98 form', () => {
    expect(normalizeMobile('09123456789')).toBe('+989123456789');
  });

  it('maps both formats of the same number to the same canonical form', () => {
    expect(normalizeMobile('+989123456789')).toBe(normalizeMobile('09123456789'));
  });

  it('passes non-string values through unchanged so validation rejects them', () => {
    expect(normalizeMobile(9123456789 as unknown as string)).toBe(9123456789);
  });
});
