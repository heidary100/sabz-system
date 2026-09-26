import { describe, expect, it } from 'vitest';
import {
  addGuestLine,
  clampQuantity,
  guestCount,
  matchesGuestLine,
  parseCartResponse,
  parseGuestCart,
  removeGuestLine,
  setGuestQuantity,
} from './cart';

const VARIANT_A = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const VARIANT_B = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';

describe('clampQuantity', () => {
  it('passes valid quantities through', () => {
    expect(clampQuantity(1)).toBe(1);
    expect(clampQuantity(99)).toBe(99);
  });

  it('floors, then clamps to 1..99', () => {
    expect(clampQuantity(0)).toBe(1);
    expect(clampQuantity(-5)).toBe(1);
    expect(clampQuantity(100)).toBe(99);
    expect(clampQuantity(2.7)).toBe(2);
  });

  it('maps non-finite input to 1', () => {
    expect(clampQuantity(Number.NaN)).toBe(1);
  });
});

describe('parseGuestCart', () => {
  it('accepts well-formed variant and product lines', () => {
    expect(
      parseGuestCart([
        { variantId: VARIANT_A, quantity: 2 },
        { productId: VARIANT_B, quantity: 1 },
      ]),
    ).toEqual([
      { variantId: VARIANT_A, quantity: 2 },
      { productId: VARIANT_B, quantity: 1 },
    ]);
  });

  it('merges duplicate identity rows with clamping', () => {
    expect(
      parseGuestCart([
        { variantId: VARIANT_A, quantity: 90 },
        { variantId: VARIANT_A, quantity: 20 },
        { productId: VARIANT_B, quantity: 1 },
        { productId: VARIANT_B, quantity: 2 },
      ]),
    ).toEqual([
      { variantId: VARIANT_A, quantity: 99 },
      { productId: VARIANT_B, quantity: 3 },
    ]);
  });

  it('keeps variant and product identities for the same id distinct', () => {
    expect(
      parseGuestCart([
        { variantId: VARIANT_A, quantity: 1 },
        { productId: VARIANT_A, quantity: 2 },
      ]),
    ).toHaveLength(2);
  });

  it('drops malformed rows and non-arrays', () => {
    expect(parseGuestCart(undefined)).toEqual([]);
    expect(parseGuestCart({})).toEqual([]);
    expect(
      parseGuestCart([
        { variantId: 'not-a-uuid', quantity: 1 },
        { variantId: VARIANT_A, quantity: 'two' },
        { quantity: 1 },
        null,
      ]),
    ).toEqual([]);
  });
});

describe('addGuestLine', () => {
  it('adds a missing variant without mutating the input', () => {
    const lines = [{ variantId: VARIANT_A, quantity: 1 }];
    const next = addGuestLine(lines, { variantId: VARIANT_B }, 2);

    expect(next).toEqual([
      { variantId: VARIANT_A, quantity: 1 },
      { variantId: VARIANT_B, quantity: 2 },
    ]);
    expect(lines).toEqual([{ variantId: VARIANT_A, quantity: 1 }]);
  });

  it('increments a present variant with clamping', () => {
    expect(
      addGuestLine([{ variantId: VARIANT_A, quantity: 98 }], { variantId: VARIANT_A }, 5),
    ).toEqual([{ variantId: VARIANT_A, quantity: 99 }]);
  });

  it('adds a product quick-add identity', () => {
    expect(addGuestLine([], { productId: VARIANT_B }, 2)).toEqual([
      { productId: VARIANT_B, quantity: 2 },
    ]);
  });
});

describe('matchesGuestLine', () => {
  it('matches either identity field', () => {
    expect(matchesGuestLine({ variantId: VARIANT_A, quantity: 1 }, VARIANT_A)).toBe(true);
    expect(matchesGuestLine({ productId: VARIANT_B, quantity: 1 }, VARIANT_B)).toBe(true);
    expect(matchesGuestLine({ variantId: VARIANT_A, quantity: 1 }, VARIANT_B)).toBe(false);
  });
});

describe('setGuestQuantity / removeGuestLine / guestCount', () => {
  const lines = [
    { variantId: VARIANT_A, quantity: 2 },
    { variantId: VARIANT_B, quantity: 3 },
  ];

  it('sets the absolute quantity', () => {
    expect(setGuestQuantity(lines, VARIANT_A, 5)).toEqual([
      { variantId: VARIANT_A, quantity: 5 },
      { variantId: VARIANT_B, quantity: 3 },
    ]);
  });

  it('removes the variant row', () => {
    expect(removeGuestLine(lines, VARIANT_A)).toEqual([
      { variantId: VARIANT_B, quantity: 3 },
    ]);
  });

  it('sums units across lines', () => {
    expect(guestCount(lines)).toBe(5);
    expect(guestCount([])).toBe(0);
  });
});

describe('parseCartResponse', () => {
  it('accepts a well-formed cart payload', () => {
    const payload = { items: [{ variantId: VARIANT_A }], totalQuantity: 2, subtotal: '10000' };

    expect(parseCartResponse(payload)).toEqual(payload);
  });

  it('rejects malformed payloads', () => {
    for (const payload of [
      undefined,
      null,
      {},
      { items: [], totalQuantity: 0 },
      { items: [], totalQuantity: '0', subtotal: '0' },
      { items: {}, totalQuantity: 0, subtotal: '0' },
      { items: [], totalQuantity: 0, subtotal: 0 },
    ]) {
      expect(() => parseCartResponse(payload)).toThrow();
    }
  });
});
