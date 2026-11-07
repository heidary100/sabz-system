import {
  SS258_ACTIVE_MERGES,
  SS258_BIVA_MERGE,
  SS258_LINK_ONLY_MERGES,
  findPromotionCollisions,
  type PromotionSnapshot,
} from './brand-merge';

function promo(
  overrides: Partial<PromotionSnapshot> = {},
): PromotionSnapshot {
  return {
    id: 'p1',
    code: 'P1',
    brandId: 'brand-1',
    productId: null,
    categoryId: null,
    type: 'PERCENT',
    value: '10',
    startsAt: new Date('2026-01-01T00:00:00.000Z'),
    endsAt: new Date('2026-12-31T00:00:00.000Z'),
    isActive: true,
    minQuantity: 1,
    ...overrides,
  };
}

describe('SS-258 curated brand mappings', () => {
  it('contains exactly the three active pairs plus the separate Biva candidate', () => {
    expect(SS258_ACTIVE_MERGES).toHaveLength(3);
    expect(SS258_ACTIVE_MERGES.map((mapping) => mapping.duplicateSlug)).toEqual([
      'green-lion-2',
      'porodo-2',
      'powerology-2',
    ]);
    expect(SS258_BIVA_MERGE.duplicateSlug).toBe('biva-2');
    expect(SS258_LINK_ONLY_MERGES.map((mapping) => mapping.duplicateSlug)).toEqual([
      'adata',
      'orico',
      'verity',
    ]);
  });

  it('never merges the Persian artifact into the English artifact', () => {
    for (const mapping of SS258_ACTIVE_MERGES) {
      expect(mapping.canonicalSlug).not.toMatch(/-2$/);
      expect(mapping.duplicateSlug).toMatch(/-2$/);
    }
  });
});

describe('SS-258 promotion collision analysis', () => {
  it('allows reassignment when there are no canonical brand promotions', () => {
    expect(findPromotionCollisions([], [promo()])).toEqual([]);
  });

  it('allows reassignment when the duplicate has no promotions', () => {
    expect(findPromotionCollisions([promo()], [])).toEqual([]);
  });

  it('allows identical overlapping rules without changing price semantics', () => {
    expect(
      findPromotionCollisions(
        [promo({ id: 'a', code: 'A' })],
        [promo({ id: 'b', code: 'B' })],
      ),
    ).toEqual([]);
  });

  it('blocks overlapping active rules with different values', () => {
    const conflicts = findPromotionCollisions(
      [promo({ id: 'a', code: 'A', value: '10' })],
      [promo({ id: 'b', code: 'B', value: '20' })],
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toContain('promotion-overlap');
  });

  it('ignores inactive and expired duplicates', () => {
    expect(
      findPromotionCollisions(
        [promo({ id: 'a', code: 'A', value: '10' })],
        [
          promo({ id: 'b', code: 'B', value: '20', isActive: false }),
          promo({
            id: 'c',
            code: 'C',
            value: '30',
            endsAt: new Date('2025-01-01T00:00:00.000Z'),
          }),
        ],
      ),
    ).toEqual([]);
  });

  it('ignores disjoint active windows', () => {
    expect(
      findPromotionCollisions(
        [
          promo({
            id: 'a',
            code: 'A',
            startsAt: new Date('2026-01-01T00:00:00.000Z'),
            endsAt: new Date('2026-02-01T00:00:00.000Z'),
          }),
        ],
        [
          promo({
            id: 'b',
            code: 'B',
            startsAt: new Date('2026-03-01T00:00:00.000Z'),
            endsAt: new Date('2026-04-01T00:00:00.000Z'),
          }),
        ],
      ),
    ).toEqual([]);
  });

  it('ignores non-brand-scoped promotions', () => {
    expect(
      findPromotionCollisions(
        [promo({ id: 'a', code: 'A', categoryId: 'c1' })],
        [promo({ id: 'b', code: 'B', productId: 'prod-1' })],
      ),
    ).toEqual([]);
  });
});
