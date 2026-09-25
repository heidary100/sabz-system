# ADR-006: PostgreSQL-Only Persian Catalog Search (Trigram + Normalization)

## Status

Accepted

## Context

The public catalog search (`GET /catalog/products?q=…`) matched only
`Product.name` and `Product.slug` with a case-insensitive `contains`
predicate. The real catalog (~1,000+ sellable products, Persian + English
names, SKUs, brands, categories, tags) needs search that tolerates Persian
spelling variance: ZWNJ/half-space variants (گوشی‌موبایل / گوشی موبایل),
Arabic/Persian letter variants (ي/ی, ك/ک), diacritics, compound-spacing
variants (لپ تاپ / لپ‌تاپ / لپتاپ), typos, and exact/prefix SKU lookups —
with deterministic relevance ranking, correct pagination, and full
composition with the existing listing filters (SS-213).

No new search infrastructure is introduced: PostgreSQL 16 is the entire
search engine (SS-216).

## Decision 1: PostgreSQL only — no dedicated search engine

Elasticsearch/OpenSearch/Meilisearch/Typesense/Algolia/vector stores are
intentionally deferred. At the target scale (≈1,000 products, revisit below),
a normalized-expression query plan inside the existing database satisfies
recall, ranking, and latency without a second system to sync, host, or
rebuild. This decision is revisited when measured p95 latency of
representative probes breaches product needs at the documented threshold
(~10k products) — not before.

## Decision 2: Normalized expression search, not a persisted search document

Three viable strategies were compared:

1. **Persisted per-product search document** (denormalized text column
   maintained by application code). Rejected: the corpus spans five tables
   (Product, ProductVariant, Brand, Category, Tag); every write path — six
   services plus the WooCommerce importer — would need to keep the document
   fresh, and brand/category renames would force bulk reindexing. The stale-
   search-data risk has no cheap complete fix.
2. **Postgres generated column.** Rejected: Prisma 6 cannot represent
   generated columns; the cross-table corpus makes a single generated column
   impossible anyway.
3. **Normalized expression search (chosen).** Immutable SQL functions
   normalize both indexed text and the query at read time, over per-table
   expression indexes. Freshness is guaranteed by construction: every write
   path and the importer are automatically searchable with zero rebuild
   logic, and existing rows were indexed when the migration ran.
4. PostgreSQL full-text (`to_tsvector`) was also rejected: the `simple`
   dictionary provides no Persian stemming, and merging SKU semantics into
   one lexeme document complicates exact-SKU boosting. Trigram similarity
   covers both typo tolerance and compound variants.

## Decision 3: Normalization rules (TS ↔ SQL mirror)

`packages/search` (`@sabz/search`) implements `normalizeFa`, `compactFa`,
`normalizeSku`, `tokenizeQuery`, and `truncateQuery`. The migration creates
the SQL mirrors `normalize_fa`, `compact_fa`, `normalize_sku` (IMMUTABLE,
PARALLEL SAFE, STRICT). Parity is enforced by the catalog-search integration
spec, which runs the shared fixture lists through BOTH implementations and
compares exactly — no tolerance.

- **`normalizeFa` (natural text):** NFC → strip Arabic diacritics
  (U+064B–U+0652, U+0670) and directional marks (LRM/RLM) → fold
  ي→ی, ك→ک, ة→ه → collapse whitespace + ZWSP + ZWNJ + BOM to one space →
  lowercase Latin → trim. Persian/Arabic digits are deliberately NOT folded
  in names (no observed recall need; folding would merge model numbers).
  Postgres `[[:space:]]` includes NEL (U+0085) while JS `\s` does not; TS
  adds U+0085 explicitly so both sides stay in parity. The database must use
  a UTF-8 encoding/locale (compose and CI defaults are `en_US.utf8`).
- **`compactFa`:** normalized text with all spaces removed, so
  لپ تاپ / لپ‌تاپ / لپتاپ converge to one comparable form. Used on both
  sides of predicates; never indexed or displayed.
- **`normalizeSku` (separate policy):** NFC → fold Persian/Arabic digits to
  ASCII → fold ي/ك → collapse whitespace → uppercase Latin. Separators
  (`- _ .` and spaces) are PRESERVED so SKU punctuation semantics survive;
  `normalizeFa` is never applied to SKUs.
- **Slugger boundary:** `slug.ts` builds URL identifiers; search
  normalization preserves searchability. Different purposes, different
  implementations. Likewise `Tag.key` (identity comparison, spaces
  stripped) stays untouched.

## Decision 4: Search corpus

| Field | Weight tier |
| --- | --- |
| `ProductVariant.sku` (live) | exact 1000 / prefix 600 / fuzzy ≥ 0.6 ≤ 100 |
| `Product.name` | exact/compact-exact 500, prefix 300, contains 200 |
| `Brand.name` / `Brand.nameEn` | exact 400, contains 150 |
| `Category.name` | exact 380, contains 150 |
| `Tag.name` / `Tag.key` | exact 360, contains 150 |
| `Product.nameEn` | prefix 300, contains 200 |
| `Product.slug`, `Product.subtitle`, `Product.focusKeyword` | contains 200 |

`focusKeyword` is index-only for search (never rendered), as reserved in the
schema since SS-203. Descriptions/specs/meta fields are excluded (noise,
cost) absent a demonstrated recall requirement. Natural-text fuzzy matching
uses `word_similarity ≥ 0.3` (typo'd or compact words inside long names) and
trigram `%` (whole-field similarity); SKU fuzzy uses a stricter
`similarity ≥ 0.6` gate so a near-miss SKU never outranks exact textual
matches.

## Decision 5: Ranking and sort interaction

Score per token = the best field tier above; multi-token queries require
EVERY token to match at least one field (token-AND) and score = the sum of
per-token best scores. Final order: `score DESC, createdAt DESC, id DESC` —
deterministic and pagination-stable.

When the user explicitly selects `price_asc` / `price_desc` / `name`, that
sort OVERRIDES relevance (`q` remains a predicate); the default/`newest`
sort becomes relevance-ranked. Price sorts reproduce the existing in-memory
semantics in SQL: minimum PRICED live-variant price, NULLS LAST regardless
of direction, newest-first tiebreak (plus the id tiebreak the in-memory sort
lacked).

## Decision 6: Indexes and query plan honesty

GIN + `gin_trgm_ops` (not GiST — read-heavy catalog, rare writes) over
normalized expressions on Product.name, Product.nameEn (partial),
Product aux (subtitle+focusKeyword), ProductVariant.sku; btree on
normalized SKU for exact lookups; trigram GIN on Brand/Category/Tag names.
All created in migration `20260924000000_ss_216_pg_trgm_search` as raw SQL
(Prisma 6 cannot express functions or expression indexes).

Measured plan behavior (EXPLAIN ANALYZE, warm cache, `scripts/search-explain.ts`):

- At seed volume (23 products): all probes 3–9 ms; the planner chooses a
  sequential scan, which is honest at this size.
- At ~1,000 synthetic products: selective probes (rare tokens, SKU, page 2)
  4–40 ms; broad tokens matching nearly the whole catalog cost 130–200 ms
  (single token) and ~400 ms (multi-token), dominated by per-row
  normalization in the match filter and per-row scoring of the full matching
  set. At this size the planner still prefers a sequential scan over the
  GIN bitmap path because the OR-chain's residual (non-indexable) branches
  make BitmapOr unattractive.
- The GIN expression indexes engage when the planner estimates them cheaper
  (larger catalogs, more selective predicates). They are NOT forced; no
  artificial plan shaping is used.

Practical reading: typical storefront searches (tens of matches) run in
single-digit to low-double-digit milliseconds at the real catalog scale.
The broad-token worst case is the documented cost of the
no-persisted-document design; the revisit trigger below covers it.

## Decision 7: Importer compatibility

Zero-touch: expression indexes read base columns at query time, so
importer-written products/variants/brands/categories/tags are searchable the
moment they are committed. No rebuild step exists. The integration suite
proves imported-shaped rows (with `sourceSystem`, `focusKeyword`) are found
immediately.

## Operational requirements and known limitations

- **Extension privilege:** `CREATE EXTENSION pg_trgm` needs superuser or an
  equivalent role (rds_superuser on RDS). Compose and CI run as DB-owner
  superuser. Managed production Postgres must allow-list `pg_trgm` BEFORE
  the migration is deployed. `unaccent` is deliberately not used (does not
  fold ي/ك; `normalize_fa` is a superset of our needs).
- **Prisma migration drift:** `prisma migrate dev`'s shadow-DB diff does not
  know these functions/indexes; a future hand-generated migration could
  propose dropping them. CI/deploys use `prisma migrate deploy`; the
  catalog-search integration spec asserts all objects exist after a fresh
  migrate, so an accidental drop fails CI loudly.
- **Locale dependency:** `lower()`/`[[:space:]]` behavior depends on the
  database locale; the parity tests pin actual behavior and fail loudly if a
  production database is created with a non-UTF-8 locale.
- **Revisit threshold:** ~10k products or sustained p95 > ~200 ms on
  representative probes. Next steps in order: raise GIN usage (review plan
  after vacuum/analyze), introduce a normalized/persisted search
  representation, then consider a dedicated search engine.
