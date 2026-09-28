import { describe, expect, it } from 'vitest';
import {
  buildCompareHref,
  COMPARE_MAX_ITEMS,
  compareSlugs,
  isCompared,
  parseCompareList,
  parseSlugsParam,
  removeCompareEntry,
  toggleCompareList,
  type CompareEntry,
} from './compare';

const ENTRY_A: CompareEntry = {
  id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  slug: 'laptop-a',
};
const ENTRY_B: CompareEntry = {
  id: '6ba7b810-9dad-41d1-80b4-00c04fd430c8',
  slug: 'laptop-b',
};
const ENTRY_C: CompareEntry = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  slug: 'laptop-c',
};
const ENTRY_D: CompareEntry = {
  id: '8d2a4f5b-1234-4567-8901-abcdef123456',
  slug: 'laptop-d',
};
const ENTRY_E: CompareEntry = {
  id: '9e3b5c6d-2345-5678-9012-bcdef1234567',
  slug: 'laptop-e',
};

describe('parseCompareList', () => {
  it('accepts well-formed entries', () => {
    expect(parseCompareList([ENTRY_A, ENTRY_B])).toEqual([ENTRY_A, ENTRY_B]);
  });

  it('rejects non-arrays and invalid rows', () => {
    expect(parseCompareList(null)).toEqual([]);
    expect(parseCompareList('nope')).toEqual([]);
    expect(
      parseCompareList([
        { id: 'not-a-uuid', slug: 'laptop-a' },
        { id: ENTRY_A.id, slug: '' },
        { id: ENTRY_A.id, slug: 'BAD SLUG!' },
        null,
        ENTRY_B,
      ]),
    ).toEqual([ENTRY_B]);
  });

  it('dedupes by id and caps at 4', () => {
    expect(
      parseCompareList([ENTRY_A, ENTRY_B, ENTRY_A, ENTRY_C, ENTRY_D, ENTRY_E]),
    ).toEqual([ENTRY_A, ENTRY_B, ENTRY_C, ENTRY_D]);
    expect(COMPARE_MAX_ITEMS).toBe(4);
  });
});

describe('toggleCompareList', () => {
  it('adds and removes entries', () => {
    const added = toggleCompareList([], ENTRY_A);
    expect(added).toEqual({ entries: [ENTRY_A], added: true });

    const removed = toggleCompareList([ENTRY_A, ENTRY_B], ENTRY_A);
    expect(removed).toEqual({ entries: [ENTRY_B], added: false });
  });

  it('blocks the fifth entry as full without mutating', () => {
    const full = [ENTRY_A, ENTRY_B, ENTRY_C, ENTRY_D];
    const result = toggleCompareList(full, ENTRY_E);
    expect(result).toEqual({ entries: full, added: false, full: true });
  });

  it('ignores invalid entries', () => {
    const result = toggleCompareList([ENTRY_A], {
      id: 'bad',
      slug: 'laptop-x',
    });
    expect(result.entries).toEqual([ENTRY_A]);
    expect(result.added).toBe(false);
  });
});

describe('isCompared / removeCompareEntry / compareSlugs', () => {
  it('tracks membership by product id', () => {
    expect(isCompared([ENTRY_A], ENTRY_A.id)).toBe(true);
    expect(isCompared([ENTRY_A], ENTRY_B.id)).toBe(false);
  });

  it('removes by id', () => {
    expect(removeCompareEntry([ENTRY_A, ENTRY_B], ENTRY_A.id)).toEqual([
      ENTRY_B,
    ]);
  });

  it('exposes slugs in order', () => {
    expect(compareSlugs([ENTRY_A, ENTRY_B])).toEqual(['laptop-a', 'laptop-b']);
  });
});

describe('parseSlugsParam / buildCompareHref', () => {
  it('parses comma-separated slugs, dropping invalid ones', () => {
    expect(parseSlugsParam('laptop-a, laptop-b')).toEqual([
      'laptop-a',
      'laptop-b',
    ]);
    expect(parseSlugsParam('')).toEqual([]);
    expect(parseSlugsParam(undefined)).toEqual([]);
    expect(parseSlugsParam('ok-slug, BAD SLUG!, ok-slug')).toEqual(['ok-slug']);
  });

  it('caps parsed slugs at 4', () => {
    expect(parseSlugsParam('a1,b2,c3,d4,e5')).toEqual(['a1', 'b2', 'c3', 'd4']);
  });

  it('builds shareable hrefs', () => {
    expect(buildCompareHref([])).toBe('/compare');
    expect(buildCompareHref(['laptop-a', 'laptop-b'])).toBe(
      '/compare?products=laptop-a,laptop-b',
    );
  });
});
