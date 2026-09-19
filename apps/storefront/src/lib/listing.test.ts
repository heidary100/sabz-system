import { describe, expect, it } from 'vitest';
import {
  buildListingQuery,
  DEFAULT_LISTING_STATE,
  parseListingState,
  withCategoryPreset,
} from './listing';

describe('parseListingState', () => {
  it('returns defaults for empty params', () => {
    expect(parseListingState({})).toEqual(DEFAULT_LISTING_STATE);
  });

  it('takes the first value of array params', () => {
    expect(parseListingState({ q: ['گوشی', 'لپتاپ'], page: ['3'] }).q).toBe('گوشی');
    expect(parseListingState({ page: ['3'] }).page).toBe(3);
  });

  it('rejects invalid sort, condition and page values', () => {
    const state = parseListingState({
      sort: 'bogus',
      condition: 'NOPE',
      page: '-4',
    });
    expect(state.sort).toBe('newest');
    expect(state.condition).toBe('');
    expect(state.page).toBe(1);
  });

  it('caps search length and page number', () => {
    expect(parseListingState({ q: 'x'.repeat(200) }).q).toHaveLength(64);
    expect(parseListingState({ page: ['99999'] }).page).toBe(10_000);
  });
});

describe('buildListingQuery', () => {
  it('omits default values', () => {
    expect(buildListingQuery(DEFAULT_LISTING_STATE, {})).toBe('');
  });

  it('encodes state changes and resets page unless explicit', () => {
    expect(buildListingQuery(DEFAULT_LISTING_STATE, { q: 'گوشی', sort: 'price_asc' })).toBe(
      'q=%DA%AF%D9%88%D8%B4%DB%8C&sort=price_asc',
    );
    expect(buildListingQuery(DEFAULT_LISTING_STATE, { page: 3 })).toBe('page=3');
  });

  it('keeps active filters when only the page changes', () => {
    const current = parseListingState({ q: 'ssd', sort: 'price_desc', page: '1' });
    expect(buildListingQuery(current, { page: 2 })).toBe('q=ssd&sort=price_desc&page=2');
  });
});

describe('withCategoryPreset', () => {
  it('forces the category while preserving other params', () => {
    const state = withCategoryPreset({ q: 'ram', category: 'other' }, 'monitors');
    expect(state.category).toBe('monitors');
    expect(state.q).toBe('ram');
  });
});
