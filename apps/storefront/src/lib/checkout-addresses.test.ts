import { describe, expect, it } from 'vitest';
import { defaultAddress, parseAddressList } from './addresses';
import {
  defaultPaymentMethod,
  defaultShippingMethod,
  isPaymentEnabled,
  isShippingEnabled,
  parseCheckoutStep,
  serializeCheckoutStep,
  stepLabel,
} from './checkout';

describe('parseAddressList', () => {
  it('returns items for a well-formed payload', () => {
    expect(parseAddressList({ items: [{ id: 'a' }] })).toEqual([{ id: 'a' }]);
  });

  it('throws for malformed payloads', () => {
    for (const payload of [undefined, null, {}, { items: null }, { items: 'x' }]) {
      expect(() => parseAddressList(payload)).toThrow();
    }
  });
});

describe('defaultAddress', () => {
  const first = { id: 'a', isDefault: false };
  const second = { id: 'b', isDefault: true };

  it('prefers the default entry', () => {
    expect(defaultAddress([first, second] as never)).toEqual(second);
  });

  it('falls back to the first entry without a default', () => {
    expect(defaultAddress([first] as never)).toEqual(first);
  });

  it('returns null for an empty book', () => {
    expect(defaultAddress([])).toBeNull();
  });
});

describe('parseCheckoutStep', () => {
  it('accepts known steps and falls back to cart', () => {
    expect(parseCheckoutStep('address')).toBe('address');
    expect(parseCheckoutStep('review')).toBe('review');
    expect(parseCheckoutStep('nope')).toBe('cart');
    expect(parseCheckoutStep(undefined)).toBe('cart');
    expect(parseCheckoutStep(null)).toBe('cart');
  });

  it('round-trips through the serializer with Persian labels', () => {
    expect(serializeCheckoutStep('payment')).toBe('step=payment');
    expect(stepLabel('review')).toBe('بازبینی و ثبت');
    expect(stepLabel('cart')).toBe('بررسی سبد');
  });
});

describe('isPaymentEnabled', () => {
  it('honours the server enabled flag', () => {
    expect(isPaymentEnabled({ code: 'ONLINE', enabled: false } as never)).toBe(false);
    expect(isPaymentEnabled({ code: 'COD', enabled: true } as never)).toBe(true);
  });

  it('tolerates pre-SS-234 payloads without the flag', () => {
    expect(isPaymentEnabled({ code: 'COD' } as never)).toBe(true);
    expect(isPaymentEnabled({ code: 'ONLINE' } as never)).toBe(false);
  });
});

describe('defaultPaymentMethod', () => {
  const cod = { code: 'COD', enabled: true };
  const online = { code: 'ONLINE', enabled: false };

  it('prefers COD while ONLINE is disabled (SS-234)', () => {
    expect(defaultPaymentMethod([online, cod] as never)).toBe('COD');
    expect(defaultPaymentMethod([cod, online] as never)).toBe('COD');
  });

  it('falls back to the first enabled method and null when all disabled', () => {
    expect(
      defaultPaymentMethod([{ code: 'ONLINE', enabled: true }] as never),
    ).toBe('ONLINE');
    expect(defaultPaymentMethod([online] as never)).toBeNull();
    expect(defaultPaymentMethod([])).toBeNull();
  });
});

describe('isShippingEnabled', () => {
  it('honours the server enabled flag', () => {
    expect(isShippingEnabled({ code: 'TIPAX', enabled: false } as never)).toBe(false);
    expect(isShippingEnabled({ code: 'TIPAX', enabled: true } as never)).toBe(true);
  });

  it('tolerates pre-SS-241 payloads without the flag', () => {
    expect(isShippingEnabled({ code: 'TIPAX' } as never)).toBe(true);
  });
});

describe('defaultShippingMethod', () => {
  const tipax = { code: 'TIPAX', enabled: false };
  const pickup = { code: 'STORE_PICKUP', enabled: true };

  it('picks the first enabled method (SS-241)', () => {
    expect(defaultShippingMethod([tipax, pickup] as never)).toBe('STORE_PICKUP');
    expect(defaultShippingMethod([pickup, tipax] as never)).toBe('STORE_PICKUP');
  });

  it('returns null when every method is disabled', () => {
    expect(defaultShippingMethod([tipax] as never)).toBeNull();
    expect(defaultShippingMethod([])).toBeNull();
  });
});
