import { Prisma } from '@prisma/client';
import { FUZZY_MIN_TOKEN_LENGTH } from '@sabz/search';

/**
 * PostgreSQL catalog search (SS-216).
 *
 * When `q` is present, `PublicCatalogService.listProducts` delegates id
 * selection to this helper instead of the Prisma `where` builder, because
 * relevance ranking and trigram/normalized matching are not expressible in
 * Prisma query syntax. Everything else — visibility, filters, pagination,
 * card hydration — stays in the service, unchanged.
 *
 * Architecture (ADR-006): per-table normalized EXPRESSION indexes over the
 * `normalize_fa` / `compact_fa` / `normalize_sku` SQL functions (created in
 * the `ss_216_pg_trgm_search` migration) — no persisted search document, so
 * every write path and the WooCommerce importer stay automatically indexed
 * with zero rebuild logic.
 *
 * Safety: user input only ever enters through bound parameters (`Prisma.sql`
 * interpolations). The SQL text itself is built exclusively from literal
 * fragments and numeric/structural values derived from validated enums.
 *
 * Performance shape: each token is normalized ONCE per query into a
 * `t0/t1/...` constants row (CROSS JOIN of an uncorrelated subselect, folded
 * to an initplan), so per-row work touches only the precomputed token forms.
 * The per-token match predicates expose `LIKE '%tok%'` / `%` on the exact
 * indexed expressions so the planner can use the GIN trigram indexes; the
 * heavier per-token scoring `GREATEST(...)` (not index-decomposable) runs
 * only on rows the match predicates already narrowed. Residual predicates
 * may still honestly scan at small scale — see scripts/search-explain.ts.
 *
 * SS-264 precision gate: every fuzzy similarity branch (`%`,
 * `word_similarity >= 0.3`, SKU `similarity >= 0.6`) additionally requires
 * the token's NORMALIZED length (computed once per query as `nl`/`sl` in the
 * constants row) to reach `FUZZY_MIN_TOKEN_LENGTH` (@sabz/search). Short
 * tokens keep exact/contains/prefix/compact matching — only fuzzy is off.
 * The gate lives in SQL (the same `char_length` of the same normalized
 * expression the indexes use), so SQL and TypeScript cannot drift; the
 * TS-side parity is pinned in the catalog-search integration spec.
 */

/** Sort mode for the search query. `relevance` = default/`newest` with q. */
export type CatalogSearchSort = 'relevance' | 'name' | 'price_asc' | 'price_desc';

export interface CatalogSearchFilters {
  /** Precomputed category-subtree product ids scope (service-owned walk). */
  categoryIds?: string[];
  /** Brand slug filter (same semantics as `brand: { is: { slug } }`). */
  brandSlug?: string;
  /** ProductCondition enum value (validated by the DTO). */
  condition?: string;
  /** Inclusive Toman lower bound (decimal-as-string, from/to pre-ordered). */
  priceFrom?: string;
  /** Inclusive Toman upper bound (decimal-as-string, from/to pre-ordered). */
  priceTo?: string;
  /** Precomputed in-stock product ids (service-owned inventory truth). */
  stockProductIds?: string[];
  /** Precomputed star-bucket product ids (service-owned review aggregates). */
  ratingProductIds?: string[];
}

export interface CatalogSearchQuery {
  /** Non-empty tokens from `tokenizeQuery` (TS-normalization-empty dropped). */
  tokens: string[];
  filters: CatalogSearchFilters;
  sort: CatalogSearchSort;
  page: number;
  limit: number;
}

export interface CatalogSearchPage {
  total: number;
  pageIds: string[];
}

/** Minimal execution surface — PrismaService or a transaction client. */
export type CatalogSearchExecutor = Pick<Prisma.TransactionClient, '$queryRaw'>;

/** Identical expression to the aux trigram index in the migration. */
const AUX_TEXT_SQL = Prisma.sql`normalize_fa(coalesce(p."subtitle", '') || ' ' || coalesce(p."focusKeyword", ''))`;

/**
 * Per-token relevance score: the best field tier for this token
 * (SKU exact 1000 > SKU prefix 600 > name exact 500 > brand exact 400 >
 * category exact 380 > tag exact 360 > prefix 300 > contains 200 >
 * ref contains 150 > trigram similarity ≤ 100). Every branch of the match
 * predicate has a strictly positive scoring counterpart, so score > 0 can
 * never contradict a match. `q` is the token's constants row
 * (`nt`/`ct`/`st` = normalized/compact/SKU forms, `nl`/`sl` = their
 * char_length, computed once per query; the SS-264 fuzzy branches also
 * require `nl`/`sl >= FUZZY_MIN_TOKEN_LENGTH`).
 */
function tokenScore(q: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`GREATEST(
    (SELECT max(CASE
        WHEN normalize_sku(v."sku") = ${q}.st THEN 1000
        WHEN normalize_sku(v."sku") LIKE ${q}.st || '%' THEN 600
        WHEN ${q}.sl >= ${FUZZY_MIN_TOKEN_LENGTH}
          AND similarity(normalize_sku(v."sku"), ${q}.st) >= 0.6
          THEN (similarity(normalize_sku(v."sku"), ${q}.st) * 100)::int
        ELSE 0
      END)
      FROM "ProductVariant" v
      WHERE v."productId" = p."id" AND v."deletedAt" IS NULL),
    CASE WHEN normalize_fa(p."name") = ${q}.nt
              OR compact_fa(p."name") = ${q}.ct
         THEN 500 ELSE 0 END,
    CASE WHEN normalize_fa(p."name") LIKE ${q}.nt || '%'
              OR normalize_fa(coalesce(p."nameEn", '')) LIKE ${q}.nt || '%'
         THEN 300 ELSE 0 END,
    CASE WHEN normalize_fa(p."name") LIKE '%' || ${q}.nt || '%'
              OR normalize_fa(coalesce(p."nameEn", '')) LIKE '%' || ${q}.nt || '%'
              OR normalize_fa(p."slug") LIKE '%' || ${q}.nt || '%'
              OR ${AUX_TEXT_SQL} LIKE '%' || ${q}.nt || '%'
         THEN 200 ELSE 0 END,
    (SELECT max(CASE
        WHEN normalize_fa(b."name") = ${q}.nt
             OR normalize_fa(coalesce(b."nameEn", '')) = ${q}.nt THEN 400
        WHEN normalize_fa(b."name") LIKE '%' || ${q}.nt || '%'
             OR normalize_fa(coalesce(b."nameEn", '')) LIKE '%' || ${q}.nt || '%' THEN 150
        WHEN ${q}.nl >= ${FUZZY_MIN_TOKEN_LENGTH}
          AND greatest(
               word_similarity(${q}.nt, normalize_fa(b."name")),
               word_similarity(${q}.nt, normalize_fa(coalesce(b."nameEn", '')))
             ) >= 0.3
          THEN (greatest(
                 word_similarity(${q}.nt, normalize_fa(b."name")),
                 word_similarity(${q}.nt, normalize_fa(coalesce(b."nameEn", '')))
               ) * 100)::int
        ELSE 0
      END)
      FROM "Brand" b
      WHERE b."id" = p."brandId" AND b."deletedAt" IS NULL),
    (SELECT max(CASE
        WHEN normalize_fa(c."name") = ${q}.nt THEN 380
        WHEN normalize_fa(c."name") LIKE '%' || ${q}.nt || '%' THEN 150
        WHEN ${q}.nl >= ${FUZZY_MIN_TOKEN_LENGTH}
          AND word_similarity(${q}.nt, normalize_fa(c."name")) >= 0.3
          THEN (word_similarity(${q}.nt, normalize_fa(c."name")) * 100)::int
        ELSE 0
      END)
      FROM "Category" c
      WHERE c."id" = p."categoryId" AND c."deletedAt" IS NULL),
    (SELECT max(CASE
        WHEN normalize_fa(g."name") = ${q}.nt
             OR normalize_fa(g."key") = ${q}.nt THEN 360
        WHEN normalize_fa(g."name") LIKE '%' || ${q}.nt || '%' THEN 150
        WHEN ${q}.nl >= ${FUZZY_MIN_TOKEN_LENGTH}
          AND word_similarity(${q}.nt, normalize_fa(g."name")) >= 0.3
          THEN (word_similarity(${q}.nt, normalize_fa(g."name")) * 100)::int
        ELSE 0
      END)
      FROM "ProductTag" pt
      JOIN "Tag" g ON g."id" = pt."tagId"
      WHERE pt."productId" = p."id"),
    CASE WHEN ${q}.nl >= ${FUZZY_MIN_TOKEN_LENGTH}
      THEN (greatest(
         word_similarity(${q}.nt, normalize_fa(p."name")),
         word_similarity(${q}.nt, normalize_fa(coalesce(p."nameEn", ''))),
         similarity(normalize_fa(p."name"), ${q}.nt),
         similarity(normalize_fa(coalesce(p."nameEn", '')), ${q}.nt)
       ) * 100)::int
      ELSE 0
    END
  )`;
}

/**
 * Per-token match predicate. Every token must match at least one corpus
 * field (token-AND across tokens, field-OR within a token). The
 * `${q}.nt <> ''` guard makes a hypothetical TS/SQL parity drift on empty
 * normalization fail closed instead of degrading into `LIKE '%%'`
 * (matches everything). SS-264: every fuzzy similarity branch (`%`,
 * `word_similarity`, SKU `similarity >= 0.6`) is additionally gated on the
 * token's normalized length (`nl`/`sl >= FUZZY_MIN_TOKEN_LENGTH`); exact,
 * contains, prefix and compact branches are deliberately ungated.
 */
function tokenMatch(q: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`(
    ${q}.nt <> ''
    AND (
      normalize_fa(p."name") LIKE '%' || ${q}.nt || '%'
      OR (${q}.nl >= ${FUZZY_MIN_TOKEN_LENGTH} AND normalize_fa(p."name") % ${q}.nt)
      OR (${q}.nl >= ${FUZZY_MIN_TOKEN_LENGTH} AND word_similarity(${q}.nt, normalize_fa(p."name")) >= 0.3)
      OR (${q}.nl >= ${FUZZY_MIN_TOKEN_LENGTH} AND normalize_fa(p."nameEn") % ${q}.nt)
      OR (${q}.nl >= ${FUZZY_MIN_TOKEN_LENGTH} AND word_similarity(${q}.nt, normalize_fa(coalesce(p."nameEn", ''))) >= 0.3)
      OR normalize_fa(p."slug") LIKE '%' || ${q}.nt || '%'
      OR ${AUX_TEXT_SQL} LIKE '%' || ${q}.nt || '%'
      OR (${q}.nl >= ${FUZZY_MIN_TOKEN_LENGTH} AND word_similarity(${q}.nt, ${AUX_TEXT_SQL}) >= 0.3)
      OR compact_fa(p."name") LIKE '%' || ${q}.ct || '%'
      OR EXISTS (
        SELECT 1 FROM "ProductVariant" v
        WHERE v."productId" = p."id" AND v."deletedAt" IS NULL
          AND (
            normalize_sku(v."sku") = ${q}.st
            OR normalize_sku(v."sku") LIKE ${q}.st || '%'
            OR (${q}.sl >= ${FUZZY_MIN_TOKEN_LENGTH} AND similarity(normalize_sku(v."sku"), ${q}.st) >= 0.6)
          )
      )
      OR EXISTS (
        SELECT 1 FROM "Brand" b
        WHERE b."id" = p."brandId" AND b."deletedAt" IS NULL
          AND (
            normalize_fa(b."name") = ${q}.nt
            OR normalize_fa(coalesce(b."nameEn", '')) = ${q}.nt
            OR normalize_fa(b."name") LIKE '%' || ${q}.nt || '%'
            OR normalize_fa(coalesce(b."nameEn", '')) LIKE '%' || ${q}.nt || '%'
            OR (${q}.nl >= ${FUZZY_MIN_TOKEN_LENGTH} AND word_similarity(${q}.nt, normalize_fa(b."name")) >= 0.3)
            OR (${q}.nl >= ${FUZZY_MIN_TOKEN_LENGTH} AND word_similarity(${q}.nt, normalize_fa(coalesce(b."nameEn", ''))) >= 0.3)
          )
      )
      OR EXISTS (
        SELECT 1 FROM "Category" c
        WHERE c."id" = p."categoryId" AND c."deletedAt" IS NULL
          AND (
            normalize_fa(c."name") = ${q}.nt
            OR normalize_fa(c."name") LIKE '%' || ${q}.nt || '%'
            OR (${q}.nl >= ${FUZZY_MIN_TOKEN_LENGTH} AND word_similarity(${q}.nt, normalize_fa(c."name")) >= 0.3)
          )
      )
      OR EXISTS (
        SELECT 1 FROM "ProductTag" pt
        JOIN "Tag" g ON g."id" = pt."tagId"
        WHERE pt."productId" = p."id"
          AND (
            normalize_fa(g."name") = ${q}.nt
            OR normalize_fa(g."key") = ${q}.nt
            OR normalize_fa(g."name") LIKE '%' || ${q}.nt || '%'
            OR (${q}.nl >= ${FUZZY_MIN_TOKEN_LENGTH} AND word_similarity(${q}.nt, normalize_fa(g."name")) >= 0.3)
          )
      )
    )
  )`;
}

// SS-217: ordering uses the denormalized Product.minPrice (kept in sync
// transactionally by recomputeProductMinPrice), so the pre-SS-217 LATERAL
// min(price) join is gone. The price-RANGE predicate below stays
// variant-level: "some live variant in range" is not equivalent to
// "minPrice in range" (variants {50, 250} match priceFrom=200).

/**
 * Builds the page query: one statement returning the ordered page of product
 * ids plus `count(*) OVER ()` as the total of the FULL matching set (window
 * functions evaluate before LIMIT, so totals stay exact per page).
 */
export function buildCatalogSearchPageSql(query: CatalogSearchQuery): Prisma.Sql {
  const { tokens, filters, sort, page, limit } = query;
  const offset = (page - 1) * limit;

  // Per-token constants (normalized/compact/SKU forms + their char_length,
  // the SS-264 fuzzy-gate input), evaluated once per query as uncorrelated
  // subselects; aliases are digits-only by construction.
  const tokenSources = tokens.map((token, index) =>
    Prisma.sql`CROSS JOIN (
      SELECT normalize_fa(${token}) AS nt, compact_fa(${token}) AS ct, normalize_sku(${token}) AS st,
             char_length(normalize_fa(${token})) AS nl, char_length(normalize_sku(${token})) AS sl
    ) t${Prisma.raw(String(index))}`,
  );

  const predicates: Prisma.Sql[] = [
    Prisma.sql`p."deletedAt" IS NULL`,
    Prisma.sql`p."status" = 'PUBLISHED'`,
    ...tokens.map((_, index) => tokenMatch(Prisma.raw(`t${index}`))),
  ];
  if (filters.categoryIds) {
    predicates.push(Prisma.sql`p."categoryId" = ANY(${filters.categoryIds}::text[])`);
  }
  if (filters.brandSlug !== undefined) {
    predicates.push(
      Prisma.sql`EXISTS (
        SELECT 1 FROM "Brand" fb
        WHERE fb."id" = p."brandId" AND fb."deletedAt" IS NULL AND fb."slug" = ${filters.brandSlug}
      )`,
    );
  }
  if (filters.condition !== undefined) {
    predicates.push(Prisma.sql`p."condition"::text = ${filters.condition}`);
  }
  if (filters.priceFrom !== undefined || filters.priceTo !== undefined) {
    // The SAME live variant must satisfy both bounds (service parity).
    predicates.push(
      Prisma.sql`EXISTS (
        SELECT 1 FROM "ProductVariant" pv
        WHERE pv."productId" = p."id" AND pv."deletedAt" IS NULL AND pv."priceStatus" = 'PRICED'
          ${filters.priceFrom !== undefined ? Prisma.sql`AND pv."price" >= ${filters.priceFrom}::numeric` : Prisma.empty}
          ${filters.priceTo !== undefined ? Prisma.sql`AND pv."price" <= ${filters.priceTo}::numeric` : Prisma.empty}
      )`,
    );
  }
  if (filters.stockProductIds) {
    predicates.push(Prisma.sql`p."id" = ANY(${filters.stockProductIds}::text[])`);
  }
  if (filters.ratingProductIds) {
    predicates.push(Prisma.sql`p."id" = ANY(${filters.ratingProductIds}::text[])`);
  }

  // `relevance` scores per token; explicit sorts keep q as a pure predicate.
  const scoreSelect =
    sort === 'relevance'
      ? Prisma.sql`, (${Prisma.join(tokens.map((_, index) => tokenScore(Prisma.raw(`t${index}`))), ' + ')}) AS "score"`
      : Prisma.empty;

  let orderBy: Prisma.Sql;
  if (sort === 'relevance') {
    orderBy = Prisma.sql`ORDER BY "score" DESC, p."createdAt" DESC, p."id" DESC`;
  } else if (sort === 'name') {
    orderBy = Prisma.sql`ORDER BY p."name" ASC, p."id" ASC`;
  } else {
    // price_asc / price_desc: NULLS LAST regardless of direction, then the
    // newest-first tiebreak — the shared catalog ordering contract.
    const direction = sort === 'price_asc' ? 'ASC' : 'DESC';
    orderBy = Prisma.sql`ORDER BY p."minPrice" ${Prisma.raw(direction)} NULLS LAST, p."createdAt" DESC, p."id" DESC`;
  }

  return Prisma.sql`SELECT "id", "total" FROM (
    SELECT p."id" AS "id", count(*) OVER () AS "total"${scoreSelect}
    FROM "Product" p
    ${Prisma.join(tokenSources, '\n    ')}
    WHERE ${Prisma.join(predicates, '\n      AND ')}
    ${orderBy}
    LIMIT ${limit} OFFSET ${offset}
  ) results`;
}

/**
 * Executes the search page query. Callers must ensure tokens is non-empty
 * and precomputed id scopes (category/stock) are non-empty when provided —
 * an empty scope matches nothing and is short-circuited in the service.
 */
export async function searchCatalogProducts(
  executor: CatalogSearchExecutor,
  query: CatalogSearchQuery,
): Promise<CatalogSearchPage> {
  const rows = await executor.$queryRaw<{ id: string; total: bigint }[]>(
    buildCatalogSearchPageSql(query),
  );
  return {
    total: Number(rows[0]?.total ?? 0),
    pageIds: rows.map((row) => row.id),
  };
}
