import { parseTrustProxy } from './trust-proxy.util';

describe('parseTrustProxy', () => {
  it('maps "true" and "false" to booleans', () => {
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('false')).toBe(false);
  });

  it('maps an integer string to a hop count', () => {
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy('2')).toBe(2);
  });

  it('passes through a single proxy specifier', () => {
    expect(parseTrustProxy('loopback')).toBe('loopback');
    expect(parseTrustProxy('172.16.0.0/12')).toBe('172.16.0.0/12');
  });

  it('returns null for blank input', () => {
    expect(parseTrustProxy('')).toBeNull();
    expect(parseTrustProxy('   ')).toBeNull();
  });
});
