import { describe, expect, it } from 'vitest';
import type { CatalogCategoryNode } from '@sabz/types';
import {
  buildSearchSubmitParams,
  categoryHasChildren,
  DESKTOP_NAV_LIMIT,
  splitNavCategories,
} from './nav';

function node(id: string, children: CatalogCategoryNode[] = []): CatalogCategoryNode {
  return { id, name: id, slug: id, sortOrder: 0, publishedProductCount: 1, children };
}

describe('splitNavCategories', () => {
  it('shows everything when under the limit', () => {
    const categories = [node('a'), node('b')];
    const split = splitNavCategories(categories);
    expect(split.visible).toHaveLength(2);
    expect(split.hasOverflow).toBe(false);
    expect(split.overflowCount).toBe(0);
  });

  it('truncates to the desktop limit with an overflow count', () => {
    const categories = Array.from({ length: DESKTOP_NAV_LIMIT + 3 }, (_, i) => node(`c${i}`));
    const split = splitNavCategories(categories);
    expect(split.visible).toHaveLength(DESKTOP_NAV_LIMIT);
    expect(split.hasOverflow).toBe(true);
    expect(split.overflowCount).toBe(3);
  });

  it('honours a custom limit', () => {
    const categories = [node('a'), node('b'), node('c')];
    expect(splitNavCategories(categories, 2).visible).toHaveLength(2);
  });
});

describe('categoryHasChildren', () => {
  it('detects parent vs leaf nodes', () => {
    expect(categoryHasChildren(node('leaf'))).toBe(false);
    expect(categoryHasChildren(node('parent', [node('child')]))).toBe(true);
  });
});

describe('buildSearchSubmitParams', () => {
  it('preserves context params and resets the page', () => {
    const current = new URLSearchParams('brand=x&sort=price_asc&page=4');
    expect(buildSearchSubmitParams(current, 'گوشی')).toBe(
      `brand=x&sort=price_asc&q=${encodeURIComponent('گوشی')}`,
    );
  });

  it('drops q when the query is empty', () => {
    const current = new URLSearchParams('q=old&page=2');
    expect(buildSearchSubmitParams(current, '')).toBe('');
  });

  it('caps the query at 64 chars like the listing state', () => {
    const current = new URLSearchParams();
    expect(buildSearchSubmitParams(current, 'x'.repeat(200))).toHaveLength(2 + 64);
  });
});
