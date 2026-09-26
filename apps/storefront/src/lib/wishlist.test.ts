import { describe, expect, it } from 'vitest';
import {
  isWishlisted,
  parseWishlistList,
  toggleWishlistIds,
} from './wishlist';

describe('isWishlisted', () => {
  it('reports membership in the id set', () => {
    expect(isWishlisted(new Set(['a']), 'a')).toBe(true);
    expect(isWishlisted(new Set(['a']), 'b')).toBe(false);
    expect(isWishlisted(new Set(), 'a')).toBe(false);
  });
});

describe('toggleWishlistIds', () => {
  it('adds a missing id without mutating the input', () => {
    const ids = new Set(['a']);
    const next = toggleWishlistIds(ids, 'b');

    expect(next).toEqual(new Set(['a', 'b']));
    expect(ids).toEqual(new Set(['a']));
  });

  it('removes a present id', () => {
    expect(toggleWishlistIds(new Set(['a', 'b']), 'a')).toEqual(new Set(['b']));
  });

  it('round-trips (add then remove restores the set)', () => {
    const ids = new Set(['a']);
    expect(toggleWishlistIds(toggleWishlistIds(ids, 'b'), 'b')).toEqual(ids);
  });
});

describe('parseWishlistList', () => {
  it('accepts a well-formed list payload', () => {
    const payload = { items: [{ id: 'a' }], total: 1 };

    expect(parseWishlistList(payload)).toEqual([{ id: 'a' }]);
  });

  it('rejects malformed payloads', () => {
    for (const payload of [
      undefined,
      null,
      {},
      { items: [], total: '1' },
      { items: {}, total: 0 },
      { items: [] },
    ]) {
      expect(() => parseWishlistList(payload)).toThrow();
    }
  });
});
