import type { ShippingMethodCode } from '@sabz/types';
import { describe, expect, it } from 'vitest';
import {
  buildCarrierTrackingUrl,
  buildIranPostTrackingUrl,
  buildTipaxTrackingUrl,
  IRAN_POST_TRACKING_URL,
  TIPAX_TRACKING_URL,
} from './carrier-tracking';

function parse(href: string | null): URL {
  if (href === null) {
    throw new Error('expected a tracking URL');
  }
  return new URL(href);
}

function idOf(href: string | null): string | null {
  return href === null ? null : parse(href).searchParams.get('id');
}

describe('buildTipaxTrackingUrl', () => {
  it('links a 13-digit barcode/contract number', () => {
    const url = parse(buildTipaxTrackingUrl('1234567890123'));
    expect(url.origin).toBe('https://tipaxco.com');
    expect(url.pathname).toBe('/tracking');
    expect(url.searchParams.get('id')).toBe('1234567890123');
  });

  it('links the documented 15–23 digit tracking-code range', () => {
    for (const value of [
      '123456789012345',
      '12345678901234567890123',
    ]) {
      expect(idOf(buildTipaxTrackingUrl(value))).toBe(value);
    }
  });

  it('rejects undocumented lengths (14, 24 and 25 digits)', () => {
    expect(buildTipaxTrackingUrl('12345678901234')).toBeNull();
    expect(buildTipaxTrackingUrl('123456789012345678901234')).toBeNull();
    expect(buildTipaxTrackingUrl('1234567890123456789012345')).toBeNull();
  });

  it('rejects alphanumeric values and internal separators', () => {
    expect(buildTipaxTrackingUrl('TIPAX-12345')).toBeNull();
    expect(buildTipaxTrackingUrl('ABC123')).toBeNull();
    expect(buildTipaxTrackingUrl('12345 678901234')).toBeNull();
    expect(buildTipaxTrackingUrl('1234567890123&evil=1')).toBeNull();
  });

  it('trims leading and trailing whitespace', () => {
    expect(idOf(buildTipaxTrackingUrl('  123456789012345  '))).toBe(
      '123456789012345',
    );
  });

  it('folds Persian and Arabic-Indic digits to ASCII', () => {
    expect(idOf(buildTipaxTrackingUrl('۱۲۳۴۵۶۷۸۹۰۱۲۳'))).toBe(
      '1234567890123',
    );
    expect(idOf(buildTipaxTrackingUrl('١٢٣٤٥٦٧٨٩٠١٢٣'))).toBe(
      '1234567890123',
    );
  });

  it('returns null for empty or whitespace-only values', () => {
    expect(buildTipaxTrackingUrl(null)).toBeNull();
    expect(buildTipaxTrackingUrl(undefined)).toBeNull();
    expect(buildTipaxTrackingUrl('')).toBeNull();
    expect(buildTipaxTrackingUrl('   ')).toBeNull();
  });

  it('only ever emits the fixed TIPAX origin and the id parameter', () => {
    const url = parse(buildTipaxTrackingUrl('123456789012345'));
    expect(url.origin).toBe(new URL(TIPAX_TRACKING_URL).origin);
    expect([...url.searchParams.keys()]).toEqual(['id']);
  });
});

describe('buildIranPostTrackingUrl', () => {
  it('links a 24-digit domestic identifier', () => {
    const value = '123456789012345678901234';
    const url = parse(buildIranPostTrackingUrl(value));
    expect(url.origin).toBe('https://tracking.post.ir');
    expect(url.pathname).toBe('/');
    expect(url.searchParams.get('id')).toBe(value);
  });

  it('links and uppercases a UPU S10 international identifier', () => {
    expect(idOf(buildIranPostTrackingUrl('rr123456789ir'))).toBe(
      'RR123456789IR',
    );
  });

  it('rejects 23/25-digit and malformed values', () => {
    expect(buildIranPostTrackingUrl('12345678901234567890123')).toBeNull();
    expect(buildIranPostTrackingUrl('1234567890123456789012345')).toBeNull();
    expect(buildIranPostTrackingUrl('ABC123')).toBeNull();
    expect(buildIranPostTrackingUrl('12345678901234567890123&evil=1')).toBeNull();
  });

  it('folds Persian digits to ASCII', () => {
    expect(idOf(buildIranPostTrackingUrl('۱۲۳۴۵۶۷۸۹۰۱۲۳۴۵۶۷۸۹۰۱۲۳۴'))).toBe(
      '123456789012345678901234',
    );
  });

  it('returns null for empty or whitespace-only values', () => {
    expect(buildIranPostTrackingUrl(null)).toBeNull();
    expect(buildIranPostTrackingUrl('   ')).toBeNull();
  });

  it('only ever emits the fixed Iran Post origin and the id parameter', () => {
    const url = parse(
      buildIranPostTrackingUrl('123456789012345678901234'),
    );
    expect(url.origin).toBe(new URL(IRAN_POST_TRACKING_URL).origin);
    expect([...url.searchParams.keys()]).toEqual(['id']);
  });
});

describe('buildCarrierTrackingUrl', () => {
  it('dispatches TIPAX to the TIPAX builder', () => {
    expect(
      buildCarrierTrackingUrl('TIPAX', '123456789012345'),
    ).toBe(buildTipaxTrackingUrl('123456789012345'));
  });

  it('dispatches IRAN_POST to the Iran Post builder', () => {
    const value = '123456789012345678901234';
    expect(buildCarrierTrackingUrl('IRAN_POST', value)).toBe(
      buildIranPostTrackingUrl(value),
    );
  });

  it('keeps local delivery and store pickup as plain text', () => {
    expect(
      buildCarrierTrackingUrl('LOCAL_DELIVERY', '123456789012345'),
    ).toBeNull();
    expect(
      buildCarrierTrackingUrl('STORE_PICKUP', '123456789012345'),
    ).toBeNull();
  });

  it('returns null for an unknown/stale method', () => {
    expect(
      buildCarrierTrackingUrl(
        'UNKNOWN' as ShippingMethodCode,
        '123456789012345',
      ),
    ).toBeNull();
  });

  it('returns null when the number is missing', () => {
    expect(buildCarrierTrackingUrl('TIPAX', null)).toBeNull();
    expect(buildCarrierTrackingUrl('IRAN_POST', '')).toBeNull();
  });
});
