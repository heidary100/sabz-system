import { describe, expect, it } from 'vitest';
import { resolveNextTarget } from './redirect';

describe('resolveNextTarget', () => {
  it('accepts root-relative internal paths', () => {
    expect(resolveNextTarget('/orders')).toBe('/orders');
    expect(resolveNextTarget('/orders/5?x=1')).toBe('/orders/5?x=1');
    expect(resolveNextTarget('/products/some-slug#reviews')).toBe(
      '/products/some-slug#reviews',
    );
    expect(resolveNextTarget('/')).toBe('/');
  });

  it('falls back on missing or empty values', () => {
    expect(resolveNextTarget(null)).toBe('/account');
    expect(resolveNextTarget(undefined)).toBe('/account');
    expect(resolveNextTarget('')).toBe('/account');
  });

  it('rejects absolute URLs and protocol-relative forms (open redirects)', () => {
    expect(resolveNextTarget('https://evil.example.com')).toBe('/account');
    expect(resolveNextTarget('http://evil.example.com/account')).toBe('/account');
    expect(resolveNextTarget('//evil.example.com')).toBe('/account');
    expect(resolveNextTarget('/\\evil.example.com')).toBe('/account');
    expect(resolveNextTarget('javascript:alert(1)')).toBe('/account');
  });

  it('honors a caller-provided fallback', () => {
    expect(resolveNextTarget('//evil.example.com', '/products')).toBe('/products');
    expect(resolveNextTarget(null, '/products')).toBe('/products');
  });
});
