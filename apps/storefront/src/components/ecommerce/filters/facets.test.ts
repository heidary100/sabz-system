import { describe, expect, it } from 'vitest';
import type { CatalogBrandDto } from '@sabz/types';
import { FACET_DEFAULT_VISIBLE } from '@/lib/nav';
import { hasFacetOverflow } from './facet-show-more';
import { filterBrandsByQuery } from './brand-facet-search';

function brand(id: string, name: string): CatalogBrandDto {
  return { id, name, slug: id };
}

describe('hasFacetOverflow', () => {
  it('needs no toggle below the threshold', () => {
    expect(hasFacetOverflow(3, FACET_DEFAULT_VISIBLE)).toBe(false);
  });

  it('needs no toggle exactly at the threshold', () => {
    expect(
      hasFacetOverflow(FACET_DEFAULT_VISIBLE, FACET_DEFAULT_VISIBLE),
    ).toBe(false);
  });

  it('needs a toggle above the threshold', () => {
    expect(hasFacetOverflow(FACET_DEFAULT_VISIBLE + 1, FACET_DEFAULT_VISIBLE)).toBe(
      true,
    );
  });
});

describe('filterBrandsByQuery', () => {
  const brands = [
    brand('anker', 'انکر'),
    brand('green-lion', 'گرین لاین'),
    brand('porodo', 'پرودو'),
  ];

  it('returns everything on an empty query', () => {
    expect(filterBrandsByQuery(brands, '')).toHaveLength(3);
    expect(filterBrandsByQuery(brands, '   ')).toHaveLength(3);
  });

  it('matches a Persian substring', () => {
    expect(filterBrandsByQuery(brands, 'گرین').map((b) => b.id)).toEqual([
      'green-lion',
    ]);
  });

  it('matches across ZWNJ differences', () => {
    // Query typed with a space matches a ZWNJ-joined brand name.
    expect(filterBrandsByQuery([brand('x', 'لپ‌تاپ')], 'لپ تاپ')).toHaveLength(1);
  });

  it('folds Arabic ي/ك in the query', () => {
    expect(filterBrandsByQuery([brand('x', 'علی')], 'علي')).toHaveLength(1);
  });

  it('returns an empty list on no match (empty state)', () => {
    expect(filterBrandsByQuery(brands, 'zzz')).toEqual([]);
  });
});
