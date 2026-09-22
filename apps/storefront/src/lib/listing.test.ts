import { describe, expect, it } from 'vitest';
import {
  buildListingHref,
  buildListingQuery,
  clearListingFilters,
  DEFAULT_LISTING_STATE,
  getActivePills,
  isFiltering,
  LISTING_PER_PAGE_DEFAULT,
  parseListingState,
  serializeListingSearch,
  withCategoryPreset,
} from './listing';
import { CONDITION_LABELS } from './condition';

describe('parseListingState', () => {
  it('returns defaults for empty params', () => {
    expect(parseListingState({})).toEqual(DEFAULT_LISTING_STATE);
    expect(DEFAULT_LISTING_STATE.perPage).toBe(24);
    expect(DEFAULT_LISTING_STATE.inStockOnly).toBe(false);
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

  it('parses valid price bounds in the API Decimal-as-string form', () => {
    const state = parseListingState({ priceFrom: '1500000', priceTo: '20000000.50' });
    expect(state.priceFrom).toBe('1500000');
    expect(state.priceTo).toBe('20000000.50');
  });

  it('treats malformed prices as absent instead of throwing', () => {
    expect(parseListingState({ priceFrom: 'abc' }).priceFrom).toBe('');
    expect(parseListingState({ priceFrom: '12.345' }).priceFrom).toBe('');
    expect(parseListingState({ priceFrom: '-5' }).priceFrom).toBe('');
    expect(parseListingState({ priceFrom: '' }).priceFrom).toBe('');
    expect(parseListingState({ priceTo: '1,000' }).priceTo).toBe('');
  });

  it('normalizes an inverted price range by swapping', () => {
    const state = parseListingState({ priceFrom: '200', priceTo: '100' });
    expect(state.priceFrom).toBe('100');
    expect(state.priceTo).toBe('200');
  });

  it('parses inStockOnly from the accepted true representations', () => {
    expect(parseListingState({ inStockOnly: 'true' }).inStockOnly).toBe(true);
    expect(parseListingState({ inStockOnly: '1' }).inStockOnly).toBe(true);
    expect(parseListingState({ inStockOnly: 'false' }).inStockOnly).toBe(false);
    expect(parseListingState({ inStockOnly: '0' }).inStockOnly).toBe(false);
    expect(parseListingState({ inStockOnly: 'yes' }).inStockOnly).toBe(false);
    expect(parseListingState({}).inStockOnly).toBe(false);
  });

  it('accepts perPage only from the supported options', () => {
    expect(parseListingState({ perPage: '12' }).perPage).toBe(12);
    expect(parseListingState({ perPage: '24' }).perPage).toBe(24);
    expect(parseListingState({ perPage: '48' }).perPage).toBe(48);
    expect(parseListingState({}).perPage).toBe(LISTING_PER_PAGE_DEFAULT);
    expect(parseListingState({ perPage: '50' }).perPage).toBe(24);
    expect(parseListingState({ perPage: '20' }).perPage).toBe(24);
    expect(parseListingState({ perPage: 'abc' }).perPage).toBe(24);
  });
});

describe('buildListingQuery (backward compatibility)', () => {
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

describe('serializeListingSearch', () => {
  it('omits every default (sort, page, perPage, stock, empty filters)', () => {
    expect(serializeListingSearch(DEFAULT_LISTING_STATE)).toBe('');
  });

  it('serializes the full filter combination', () => {
    const state = parseListingState({
      q: 'ssd',
      category: 'storage',
      brand: 'orico',
      condition: 'NEW',
      priceFrom: '1000',
      priceTo: '2000',
      inStockOnly: 'true',
      sort: 'price_asc',
      perPage: '48',
      page: '2',
    });
    expect(serializeListingSearch(state)).toBe(
      'q=ssd&category=storage&brand=orico&condition=NEW&priceFrom=1000&priceTo=2000&inStockOnly=true&sort=price_asc&perPage=48&page=2',
    );
  });
});

describe('buildListingHref', () => {
  it('returns the bare base path when nothing is active', () => {
    expect(buildListingHref('/products', DEFAULT_LISTING_STATE)).toBe('/products');
    expect(buildListingHref('/categories/storage', DEFAULT_LISTING_STATE)).toBe(
      '/categories/storage',
    );
  });

  it('preserves the ?category= deep link on /products', () => {
    const state = parseListingState({ category: 'storage' });
    expect(buildListingHref('/products', state, { brand: 'orico' })).toBe(
      '/products?category=storage&brand=orico',
    );
  });

  it('never leaks ?category= on category routes', () => {
    const state = withCategoryPreset({ brand: 'orico' }, 'storage');
    expect(state.category).toBe('storage');
    expect(buildListingHref('/categories/storage', state)).toBe(
      '/categories/storage?brand=orico',
    );
    // A hostile ?category= query value cannot escape into the URL either.
    const hostile = withCategoryPreset({ category: 'other' }, 'storage');
    expect(buildListingHref('/categories/storage', hostile, { brand: 'orico' })).toBe(
      '/categories/storage?brand=orico',
    );
  });

  it('keeps the category pathname through every mutation', () => {
    const base = '/categories/storage';
    const state = withCategoryPreset(
      {
        q: 'ssd',
        brand: 'orico',
        condition: 'NEW',
        priceFrom: '1000',
        priceTo: '2000',
        inStockOnly: 'true',
        sort: 'price_asc',
        perPage: '48',
        page: '2',
      },
      'storage',
    );
    for (const changes of [
      { brand: 'anker' },
      { condition: 'USED' },
      { q: 'ram' },
      { priceFrom: '500' },
      { priceTo: '5000' },
      { inStockOnly: false },
      { sort: 'name' as const },
      { perPage: 12 },
      { page: 3 },
    ]) {
      const href = buildListingHref(base, state, changes);
      expect(href.startsWith(`${base}?`) || href === base).toBe(true);
      expect(href).not.toContain('category=');
      expect(href).not.toContain('/products');
    }
  });

  it('preserves q across every control change', () => {
    const state = parseListingState({ q: 'ssd' });
    expect(buildListingHref('/products', state, { brand: 'orico' })).toContain('q=ssd');
    expect(buildListingHref('/products', state, { sort: 'price_asc' })).toContain('q=ssd');
    expect(buildListingHref('/products', state, { page: 2 })).toContain('q=ssd');
    expect(buildListingHref('/products', state, { perPage: 48 })).toContain('q=ssd');
    expect(buildListingHref('/products', state, { priceFrom: '100' })).toContain('q=ssd');
    expect(buildListingHref('/products', state, { inStockOnly: true })).toContain(
      'q=ssd',
    );
  });

  it('resets the page on every non-page mutation', () => {
    const atPage3 = parseListingState({ page: '3', brand: 'orico' });
    expect(buildListingHref('/products', atPage3, { brand: 'anker' })).not.toContain(
      'page=',
    );
    expect(buildListingHref('/products', atPage3, { sort: 'price_asc' })).not.toContain(
      'page=',
    );
    expect(buildListingHref('/products', atPage3, { q: 'ram' })).not.toContain('page=');
    expect(buildListingHref('/products', atPage3, { priceFrom: '100' })).not.toContain(
      'page=',
    );
    expect(buildListingHref('/products', atPage3, { priceTo: '200' })).not.toContain(
      'page=',
    );
    expect(buildListingHref('/products', atPage3, { inStockOnly: true })).not.toContain(
      'page=',
    );
    expect(buildListingHref('/products', atPage3, { perPage: 48 })).not.toContain(
      'page=',
    );
    expect(buildListingHref('/products', atPage3, { condition: 'NEW' })).not.toContain(
      'page=',
    );
  });

  it('preserves all other state on explicit pagination', () => {
    const state = parseListingState({
      q: 'ssd',
      brand: 'orico',
      condition: 'NEW',
      priceFrom: '100',
      inStockOnly: 'true',
      sort: 'price_desc',
      perPage: '48',
    });
    expect(buildListingHref('/products', state, { page: 2 })).toBe(
      '/products?q=ssd&brand=orico&condition=NEW&priceFrom=100&inStockOnly=true&sort=price_desc&perPage=48&page=2',
    );
  });
});

describe('withCategoryPreset', () => {
  it('forces the category while preserving other params', () => {
    const state = withCategoryPreset({ q: 'ram', category: 'other' }, 'monitors');
    expect(state.category).toBe('monitors');
    expect(state.q).toBe('ram');
  });
});

describe('clearListingFilters', () => {
  it('clears narrowing facets and resets the page but preserves presentation', () => {
    const state = parseListingState({
      q: 'ssd',
      brand: 'orico',
      condition: 'NEW',
      priceFrom: '100',
      priceTo: '200',
      inStockOnly: 'true',
      sort: 'price_asc',
      perPage: '48',
      page: '3',
    });
    const cleared = { ...state, ...clearListingFilters() };
    expect(cleared).toMatchObject({
      q: '',
      brand: '',
      condition: '',
      priceFrom: '',
      priceTo: '',
      inStockOnly: false,
      page: 1,
      sort: 'price_asc',
      perPage: 48,
    });
  });

  it('restores the bare route through the href builder', () => {
    const state = parseListingState({ brand: 'orico', page: '2' });
    expect(buildListingHref('/products', state, clearListingFilters())).toBe(
      '/products',
    );
    const categoryState = withCategoryPreset({ brand: 'orico', page: '2' }, 'storage');
    expect(
      buildListingHref('/categories/storage', categoryState, clearListingFilters()),
    ).toBe('/categories/storage');
  });
});

describe('isFiltering', () => {
  it('is false for the default state', () => {
    expect(isFiltering(DEFAULT_LISTING_STATE)).toBe(false);
  });

  it('is true for any narrowing facet', () => {
    expect(isFiltering({ ...DEFAULT_LISTING_STATE, q: 'x' })).toBe(true);
    expect(isFiltering({ ...DEFAULT_LISTING_STATE, brand: 'x' })).toBe(true);
    expect(isFiltering({ ...DEFAULT_LISTING_STATE, condition: 'NEW' })).toBe(true);
    expect(isFiltering({ ...DEFAULT_LISTING_STATE, priceFrom: '1' })).toBe(true);
    expect(isFiltering({ ...DEFAULT_LISTING_STATE, priceTo: '1' })).toBe(true);
    expect(isFiltering({ ...DEFAULT_LISTING_STATE, inStockOnly: true })).toBe(true);
  });

  it('ignores presentation state', () => {
    expect(isFiltering({ ...DEFAULT_LISTING_STATE, sort: 'price_asc' })).toBe(false);
    expect(isFiltering({ ...DEFAULT_LISTING_STATE, page: 4 })).toBe(false);
    expect(isFiltering({ ...DEFAULT_LISTING_STATE, perPage: 48 })).toBe(false);
  });
});

describe('getActivePills', () => {
  it('returns no pills for the default state', () => {
    expect(getActivePills(DEFAULT_LISTING_STATE)).toEqual([]);
  });

  it('never exposes sort, page, or perPage as pills', () => {
    const pills = getActivePills({
      ...DEFAULT_LISTING_STATE,
      sort: 'price_asc',
      page: 3,
      perPage: 48,
    });
    expect(pills).toEqual([]);
  });

  it('builds one pill per active facet with exact removal partials', () => {
    const state = parseListingState({
      q: 'ssd',
      brand: 'orico',
      condition: 'NEW',
      priceFrom: '10000000',
      priceTo: '20000000',
      inStockOnly: 'true',
    });
    const pills = getActivePills(state, {
      brandName: 'ORICO',
      conditionLabels: CONDITION_LABELS,
    });
    expect(pills.map((pill) => pill.key)).toEqual([
      'q',
      'brand',
      'condition',
      'price',
      'inStock',
    ]);
    expect(pills.map((pill) => pill.label)).toEqual([
      'جستجو: ssd',
      'برند: ORICO',
      'وضعیت: نو',
      'قیمت: ۱۰٬۰۰۰٬۰۰۰ تا ۲۰٬۰۰۰٬۰۰۰',
      'فقط موجود',
    ]);
    expect(pills.map((pill) => pill.clear)).toEqual([
      { q: '' },
      { brand: '' },
      { condition: '' },
      { priceFrom: '', priceTo: '' },
      { inStockOnly: false },
    ]);
  });

  it('falls back to the brand slug when no brand name is available', () => {
    const pills = getActivePills({ ...DEFAULT_LISTING_STATE, brand: 'orico' });
    expect(pills[0]!.label).toBe('برند: orico');
  });

  it('renders open-ended price ranges', () => {
    expect(
      getActivePills({ ...DEFAULT_LISTING_STATE, priceFrom: '5000' })[0]!.label,
    ).toBe('قیمت: از ۵٬۰۰۰');
    expect(getActivePills({ ...DEFAULT_LISTING_STATE, priceTo: '5000' })[0]!.label).toBe(
      'قیمت: تا ۵٬۰۰۰',
    );
  });
});
