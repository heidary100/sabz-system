-- SS-216 — Persian Postgres search (trigram + normalization).
--
-- Raw SQL by design: Prisma 6 cannot represent custom functions, expression
-- indexes, or GIN indexes, so everything lives here and schema.prisma stays
-- untouched. Consequence (documented in ADR-006): `prisma migrate dev`'s
-- shadow-DB diff does not know these objects and a FUTURE hand-generated
-- migration could propose dropping them — CI/prod only ever run
-- `prisma migrate deploy`, and the catalog-search integration spec asserts
-- the extension/functions/indexes exist after a fresh migrate, so an
-- accidental drop fails loudly.
--
-- Privileges: `CREATE EXTENSION pg_trgm` requires superuser or an
-- equivalent role (rds_superuser on RDS). Compose and the CI service
-- container both run as DB-owner superuser. On managed production Postgres
-- the extension must be allow-listed/enabled on the instance BEFORE this
-- migration is applied.
--
-- The three normalizer functions are the exact mirror of
-- packages/search/src/normalize.ts; parity is enforced (no tolerance) by the
-- catalog-search integration spec over the shared fixture lists.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- Normalizers
-- ---------------------------------------------------------------------------

-- Natural-language search normalization. Order mirrors normalizeFa():
-- NFC → diacritics removed (U+064B-U+0652, U+0670) → directional marks
-- removed (LRM/RLM) → Arabic letters folded to Persian → separators
-- (whitespace + ZWSP + ZWNJ + BOM) collapsed to one space → lowercased →
-- trimmed. Persian/Arabic digits are deliberately NOT folded here.
CREATE OR REPLACE FUNCTION normalize_fa(t text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog
AS $fn$
  SELECT btrim(
    regexp_replace(
      lower(
        translate(
          regexp_replace(
            regexp_replace(
              normalize(t, NFC),
              E'[\u064b-\u0652\u0670]',
              '',
              'g'
            ),
            E'[\u200e\u200f]',
            '',
            'g'
          ),
          E'\u064a\u0643\u0629',
          E'\u06cc\u06a9\u0647'
        )
      ),
      E'[[:space:]\u200b\u200c\ufeff]+',
      ' ',
      'g'
    )
  )
$fn$;

-- Compact form: the normalized text with all spaces removed, so compound
-- spelling variants (لپ تاپ / لپ‌تاپ / لپتاپ) converge to one comparable
-- form. Never indexed or displayed; compared on both sides of a predicate.
CREATE OR REPLACE FUNCTION compact_fa(t text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog
AS $fn$
  SELECT replace(public.normalize_fa(t), ' ', '')
$fn$;

-- SKU normalization — a deliberately SEPARATE policy from natural text:
-- separators (- _ . space) preserved, Latin uppercased, Persian/Arabic
-- digits folded to ASCII, Arabic yeh/kaf folded to Persian.
CREATE OR REPLACE FUNCTION normalize_sku(t text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog
AS $fn$
  SELECT btrim(
    regexp_replace(
      upper(
        translate(
          normalize(t, NFC),
          E'\u064a\u0643\u06f0\u06f1\u06f2\u06f3\u06f4\u06f5\u06f6\u06f7\u06f8\u06f9\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669',
          E'\u06cc\u06a901234567890123456789'
        )
      ),
      E'[[:space:]\u0085]+',
      ' ',
      'g'
    )
  )
$fn$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
-- GIN + gin_trgm_ops (not GiST): the catalog is read-heavy with rare
-- writes, and GIN wins for %/LIKE lookups at this write volume. The aux
-- expression below must stay byte-identical to the one in
-- public-catalog-search.ts — the planner only uses an expression index when
-- the query expression matches the indexed one exactly.

CREATE INDEX "Product_search_name_trgm_idx"
  ON "Product" USING gin (normalize_fa("name") gin_trgm_ops);

CREATE INDEX "Product_search_nameEn_trgm_idx"
  ON "Product" USING gin (normalize_fa("nameEn") gin_trgm_ops)
  WHERE "nameEn" IS NOT NULL;

CREATE INDEX "Product_search_aux_trgm_idx"
  ON "Product" USING gin (normalize_fa(coalesce("subtitle", '') || ' ' || coalesce("focusKeyword", '')) gin_trgm_ops);

CREATE INDEX "ProductVariant_search_sku_exact_idx"
  ON "ProductVariant" (normalize_sku("sku"));

CREATE INDEX "ProductVariant_search_sku_trgm_idx"
  ON "ProductVariant" USING gin (normalize_sku("sku") gin_trgm_ops);

CREATE INDEX "Brand_search_name_trgm_idx"
  ON "Brand" USING gin (normalize_fa("name") gin_trgm_ops);

CREATE INDEX "Category_search_name_trgm_idx"
  ON "Category" USING gin (normalize_fa("name") gin_trgm_ops);

CREATE INDEX "Tag_search_name_trgm_idx"
  ON "Tag" USING gin (normalize_fa("name") gin_trgm_ops);
