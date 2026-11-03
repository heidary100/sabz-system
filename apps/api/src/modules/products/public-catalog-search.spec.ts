import {
  buildCatalogSearchPageSql,
  type CatalogSearchQuery,
} from './public-catalog-search';

/**
 * Unit tests for the SS-216 catalog-search SQL builder (pure, no database).
 *
 * The critical safety property asserted here: user tokens only ever appear in
 * bound parameters (`sql.values`) — never interpolated into the SQL text.
 */
describe('buildCatalogSearchPageSql (SS-216)', () => {
  const base: CatalogSearchQuery = {
    tokens: ['گوشی'],
    filters: {},
    sort: 'relevance',
    page: 1,
    limit: 20,
  };

  it('binds tokens as parameters, never interpolates them into SQL text', () => {
    const built = buildCatalogSearchPageSql(base);
    expect(built.sql).not.toContain('گوشی');
    expect(built.values).toContain('گوشی');
  });

  it('emits one match predicate per token (token-AND semantics)', () => {
    const built = buildCatalogSearchPageSql({ ...base, tokens: ['سامسونگ', 'SSD'] });
    // Every bound occurrence of each token belongs to its own predicate;
    // both tokens must be bound.
    expect(built.values).toContain('سامسونگ');
    expect(built.values).toContain('SSD');
    // The match chain joins predicates with AND.
    expect(built.sql).toMatch(/AND\s+\(\s*normalize_fa\(/);
  });

  it('includes normalization guards and SKU fuzzy gate in the SQL', () => {
    const built = buildCatalogSearchPageSql(base);
    expect(built.sql).toContain('normalize_fa(');
    expect(built.sql).toContain('compact_fa(');
    expect(built.sql).toContain('normalize_sku(');
    expect(built.sql).toContain('word_similarity(');
    expect(built.sql).toContain('>= 0.6');
    expect(built.sql).not.toContain('unaccent');
  });

  // ---------------------------------------------------------------------
  // SS-264: the fuzzy token-length gate
  // ---------------------------------------------------------------------

  it('wraps every word_similarity branch in the SS-264 normalized-length guard', () => {
    const built = buildCatalogSearchPageSql(base);
    // FROZEN BRANCH INVENTORY for a single-token query (SS-264): changing the
    // branch structure must update this deliberately, never silently.
    // match predicate: name ws, nameEn ws, aux ws, brand ws ×2, category ws,
    //   tag ws + the `%` branches on name/nameEn = 9 OR-guards
    // score mirror: brand, category, tag (`WHEN … nl >= ? AND greatest/ws`)
    //   + the final name similarity GREATEST (`CASE WHEN … nl >= ?`) = 4
    expect((built.sql.match(/OR \(t0\.nl >= \? AND/g) ?? []).length).toBe(9);
    // 3 WHEN guards (brand/category/tag) + 1 CASE WHEN (final GREATEST),
    // which the plain WHEN regex also counts.
    expect((built.sql.match(/WHEN t0\.nl >= \?/g) ?? []).length).toBe(4);
    expect((built.sql.match(/CASE WHEN t0\.nl >= \?/g) ?? []).length).toBe(1);
    // Every word_similarity occurrence lives inside those guarded regions.
    expect((built.sql.match(/word_similarity\(/g) ?? []).length).toBe(17);
  });

  it('wraps the SKU similarity branch in the same normalized-SKU-length guard', () => {
    const built = buildCatalogSearchPageSql(base);
    // match predicate EXISTS branch + score CASE = 2 sl guards; the SKU
    // similarity function appears 3× (match WHEN, score WHEN, score THEN),
    // all inside the guarded regions; the final name-similarity GREATEST
    // contributes 2 more \bsimilarity( behind the nl CASE guard.
    expect((built.sql.match(/\.sl >= \?/g) ?? []).length).toBe(2);
    expect((built.sql.match(/OR \(t0\.sl >= \? AND \bsimilarity\(/g) ?? []).length).toBe(1);
    expect((built.sql.match(/WHEN t0\.sl >= \?\s+AND \bsimilarity\(/g) ?? []).length).toBe(1);
    expect((built.sql.match(/\bsimilarity\(/g) ?? []).length).toBe(5);
  });

  it('keeps exact, contains, prefix and compact branches ungated', () => {
    const built = buildCatalogSearchPageSql(base);
    // Name contains + nameEn/slug/aux contains are bare LIKEs, never preceded
    // by the length guard; exact/compact/SKU tiers are untouched.
    expect(built.sql).toContain(`normalize_fa(p."name") LIKE '%' || t0.nt || '%'`);
    expect(built.sql).toContain(`normalize_fa(p."name") = t0.nt`);
    expect(built.sql).toContain(`compact_fa(p."name") = t0.ct`);
    expect(built.sql).toContain(`compact_fa(p."name") LIKE '%' || t0.ct || '%'`);
    expect(built.sql).toContain(`normalize_sku(v."sku") = t0.st`);
    expect(built.sql).toContain(`normalize_sku(v."sku") LIKE t0.st || '%'`);
    expect(built.sql).toMatch(/CASE WHEN normalize_fa\(p\."name"\) = t0\.nt/);
    // None of the exact/contains/prefix literals sit behind a guard.
    expect(built.sql).not.toContain(`nl >= ? AND normalize_fa(p."name") LIKE`);
    expect(built.sql).not.toContain(`nl >= ? AND normalize_sku(v."sku") =`);
  });

  it('binds the frozen gate value (6) as a parameter and gates every token', () => {
    const built = buildCatalogSearchPageSql({ ...base, tokens: ['ورتی', 'Anker'] });
    expect(built.values).toContain(6);
    // Both token-AND predicates carry the guard (t0 and t1).
    expect(built.sql).toContain('t0.nl >= ?');
    expect(built.sql).toContain('t1.nl >= ?');
    expect(built.sql).toContain('t0.sl >= ?');
    expect(built.sql).toContain('t1.sl >= ?');
  });

  it('relevance sort orders by the summed per-token score', () => {
    const built = buildCatalogSearchPageSql(base);
    expect(built.sql).toContain('AS "score"');
    expect(built.sql).toContain('ORDER BY "score" DESC, p."createdAt" DESC, p."id" DESC');
  });

  it('name sort overrides relevance (q is a pure predicate)', () => {
    const built = buildCatalogSearchPageSql({ ...base, sort: 'name' });
    expect(built.sql).not.toContain('AS "score"');
    expect(built.sql).toContain('ORDER BY p."name" ASC, p."id" ASC');
  });

  it('price sorts order by the denormalized minPrice column, NULLS last both ways (SS-217)', () => {
    const asc = buildCatalogSearchPageSql({ ...base, sort: 'price_asc' });
    expect(asc.sql).toContain(
      'ORDER BY p."minPrice" ASC NULLS LAST, p."createdAt" DESC, p."id" DESC',
    );
    // The pre-SS-217 LATERAL min(price) join is gone; the price-range
    // predicate stays variant-level in the WHERE clause (asserted below with
    // a range present — without one there is no variant predicate at all).
    expect(asc.sql).not.toContain('LATERAL');

    const ranged = buildCatalogSearchPageSql({
      ...base,
      sort: 'price_asc',
      filters: { priceFrom: '200' },
    });
    expect(ranged.sql).toContain("pv.\"priceStatus\" = 'PRICED'");
    expect(ranged.sql).toContain('pv."price" >= ?');

    const desc = buildCatalogSearchPageSql({ ...base, sort: 'price_desc' });
    expect(desc.sql).toContain(
      'ORDER BY p."minPrice" DESC NULLS LAST, p."createdAt" DESC, p."id" DESC',
    );
  });

  it('computes the exact total of the full matching set via window count', () => {
    const built = buildCatalogSearchPageSql(base);
    expect(built.sql).toContain('count(*) OVER ()');
    expect(built.sql).toMatch(/LIMIT \? OFFSET \?/);
  });

  it('applies the category-subtree scope as data', () => {
    const ids = ['id-1', 'id-2'];
    const built = buildCatalogSearchPageSql({
      ...base,
      filters: { categoryIds: ids },
    });
    expect(built.sql).toContain('p."categoryId" = ANY(');
    expect(built.values).toContainEqual(ids);
  });

  it('applies the in-stock scope as data', () => {
    const ids = ['p-1'];
    const built = buildCatalogSearchPageSql({
      ...base,
      filters: { stockProductIds: ids },
    });
    expect(built.sql).toContain('p."id" = ANY(');
    expect(built.values).toContainEqual(ids);
  });

  it('applies the rating-bucket scope as data (SS-236)', () => {
    const ids = ['p-5'];
    const built = buildCatalogSearchPageSql({
      ...base,
      filters: { ratingProductIds: ids },
    });
    expect(built.sql).toContain('p."id" = ANY(');
    expect(built.values).toContainEqual(ids);
  });

  it('mirrors the brand-slug and condition visibility semantics', () => {
    const built = buildCatalogSearchPageSql({
      ...base,
      filters: { brandSlug: 'orico', condition: 'NEW' },
    });
    expect(built.sql).toContain('fb."slug" = ');
    expect(built.sql).toContain('fb."deletedAt" IS NULL');
    expect(built.sql).toContain('p."condition"::text = ');
    expect(built.values).toContain('orico');
    expect(built.values).toContain('NEW');
  });

  it('keeps the same-variant price-range rule (both bounds on one variant)', () => {
    const built = buildCatalogSearchPageSql({
      ...base,
      filters: { priceFrom: '100000', priceTo: '200000' },
    });
    expect(built.sql).toContain('pv."price" >= ');
    expect(built.sql).toContain('pv."price" <= ');
    expect(built.sql).toContain("pv.\"priceStatus\" = 'PRICED'");
  });

  it('paginates deterministically', () => {
    const built = buildCatalogSearchPageSql({ ...base, page: 3, limit: 12 });
    expect(built.values).toContain(12);
    expect(built.values).toContain(24);
  });

  it('keeps public visibility (PUBLISHED, non-deleted) in the query', () => {
    const built = buildCatalogSearchPageSql(base);
    expect(built.sql).toContain('p."deletedAt" IS NULL');
    expect(built.sql).toContain("p.\"status\" = 'PUBLISHED'");
  });
});
