import { describe, expect, it } from 'vitest';
import type { CatalogCategoryNode } from '@sabz/types';
import {
  buildSearchSubmitParams,
  categoryHasChildren,
  DESKTOP_NAV_LIMIT,
  findCategoryNode,
  findCategoryPath,
  findSiblings,
  navRoots,
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

describe('navRoots', () => {
  it('unwraps a sole parent to its children', () => {
    const tree = [node('root', [node('a'), node('b')])];
    expect(navRoots(tree).map((n) => n.slug)).toEqual(['a', 'b']);
  });

  it('unwraps a dominant trunk and keeps minor roots after its children (SS-223)', () => {
    const trunk = {
      ...node('trunk', [node('c1'), node('c2'), node('c3')]),
      publishedProductCount: 1000,
    };
    const minor = { ...node('minor'), publishedProductCount: 9 };
    const roots = navRoots([trunk, minor]);
    expect(roots.map((n) => n.slug)).toEqual(['c1', 'c2', 'c3', 'minor']);
  });

  it('keeps a balanced multi-root tree untouched (no dominant trunk)', () => {
    const a = { ...node('a', [node('a1')]), publishedProductCount: 50 };
    const b = { ...node('b', [node('b1')]), publishedProductCount: 50 };
    const tree = [a, b];
    expect(navRoots(tree)).toBe(tree);
  });

  it('keeps a childless sole root (nothing to unwrap)', () => {
    const tree = [node('root')];
    expect(navRoots(tree)).toBe(tree);
  });

  it('never unwraps when all counts are zero', () => {
    const empty = { ...node('root', [node('a')]), publishedProductCount: 0 };
    const tree = [empty];
    expect(navRoots(tree)).toBe(tree);
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

  it('caps the query by graphemes without splitting surrogate pairs (SS-216)', () => {
    const current = new URLSearchParams();
    const emoji = '\u{1F600}';
    const out = buildSearchSubmitParams(current, emoji.repeat(100));
    expect(out).toBe(`q=${encodeURIComponent(emoji.repeat(64))}`);
  });
});

function tree(): CatalogCategoryNode[] {
  const ssdSata = node('ssd-sata');
  const ssdNvme = node('ssd-nvme');
  const ssd = node('ssd', [ssdSata, ssdNvme]);
  const hdd = node('hdd');
  const storage = node('storage', [ssd, hdd]);
  const phone = node('phone');
  const root = node('digital', [storage, phone]);
  return [root];
}

describe('findCategoryNode', () => {
  it('finds the root itself', () => {
    expect(findCategoryNode(tree(), 'digital')?.name).toBe('digital');
  });

  it('finds a depth-3 node', () => {
    expect(findCategoryNode(tree(), 'ssd-nvme')?.name).toBe('ssd-nvme');
  });

  it('returns null for a missing slug', () => {
    expect(findCategoryNode(tree(), 'nope')).toBeNull();
  });
});

describe('findCategoryPath', () => {
  it('returns a single crumb for the root', () => {
    expect(findCategoryPath(tree(), 'digital').map((c) => c.slug)).toEqual([
      'digital',
    ]);
  });

  it('returns the depth-2 ancestry root-first', () => {
    expect(findCategoryPath(tree(), 'ssd').map((c) => c.slug)).toEqual([
      'digital',
      'storage',
      'ssd',
    ]);
  });

  it('returns the depth-3 ancestry root-first', () => {
    expect(findCategoryPath(tree(), 'ssd-nvme').map((c) => c.slug)).toEqual([
      'digital',
      'storage',
      'ssd',
      'ssd-nvme',
    ]);
  });

  it('returns an empty path for a missing slug', () => {
    expect(findCategoryPath(tree(), 'nope')).toEqual([]);
  });
});

describe('findSiblings', () => {
  it('returns the children of the parent for a nested node', () => {
    const { parent, siblings } = findSiblings(tree(), 'ssd');
    expect(parent?.slug).toBe('storage');
    expect(siblings.map((s) => s.slug)).toEqual(['ssd', 'hdd']);
  });

  it('returns the unwrapped roots for a root-level leaf', () => {
    const { parent, siblings } = findSiblings(tree(), 'phone');
    expect(parent).toBeNull();
    expect(siblings.map((s) => s.slug)).toEqual(['storage', 'phone']);
  });

  it('unwraps a sole root so its children are root-level siblings', () => {
    const { parent, siblings } = findSiblings(tree(), 'storage');
    expect(parent).toBeNull();
    expect(siblings.map((s) => s.slug)).toEqual(['storage', 'phone']);
  });

  it('returns empty siblings for a missing slug', () => {
    expect(findSiblings(tree(), 'nope').siblings).toEqual([]);
  });

  it('handles a sole child (sibling nav stays hidden)', () => {
    const lone = [node('root', [node('only', [node('single')])])];
    const { parent, siblings } = findSiblings(lone, 'single');
    expect(parent?.slug).toBe('only');
    expect(siblings.map((s) => s.slug)).toEqual(['single']);
  });

  it('keeps multi-root trees untouched', () => {
    const multi = [node('a'), node('b')];
    const { parent, siblings } = findSiblings(multi, 'b');
    expect(parent).toBeNull();
    expect(siblings.map((s) => s.slug)).toEqual(['a', 'b']);
  });
});
