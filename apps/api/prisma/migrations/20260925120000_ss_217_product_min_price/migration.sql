-- SS-217 — Product.minPrice denormalization (DB-side catalog price sorting).
--
-- minPrice = MIN("price") over LIVE (deletedAt IS NULL), PRICED variants of
-- the product. compareAtPrice never contributes: it is a static reference
-- price (SS-201) and does not affect the effective/displayed price.
-- NULL = no live priced variant (call-for-price product); NULLs sort LAST in
-- both public price sort directions (the pre-existing catalog contract).
--
-- Runtime is transactional: recomputeProductMinPrice()
-- (apps/api/src/modules/products/min-price.ts) recomputes the column from
-- source-of-truth variants inside the same transaction as every variant
-- mutation.
--
-- The two sort indexes below are partial raw-SQL objects: Prisma cannot
-- express partial indexes, and per-direction ordering with the exact
-- (minPrice, createdAt DESC, id DESC) tie-break only pays off when the
-- index row order matches the query's ORDER BY byte-for-byte. Same drift
-- policy as SS-216 (ADR-006): `prisma migrate deploy` is the only applier
-- in CI/prod; the minprice integration spec asserts the indexes exist.
--
-- Backfill: aggregate from variants, not from any demo-seed assumption. At
-- the production dataset scale (~1.1k products) the plain UPDATE is trivial;
-- the column-level predicate keeps it idempotent under retry.

ALTER TABLE "Product" ADD COLUMN "minPrice" DECIMAL(12,2);

UPDATE "Product" p
SET "minPrice" = agg."mp"
FROM (
  SELECT "productId", MIN("price") AS "mp"
  FROM "ProductVariant"
  WHERE "deletedAt" IS NULL
    AND "priceStatus" = 'PRICED'
  GROUP BY "productId"
) agg
WHERE agg."productId" = p."id";

CREATE INDEX "Product_public_minPrice_asc_idx"
  ON "Product" ("minPrice" ASC NULLS LAST, "createdAt" DESC, "id" DESC)
  WHERE "status" = 'PUBLISHED'
    AND "deletedAt" IS NULL;

CREATE INDEX "Product_public_minPrice_desc_idx"
  ON "Product" ("minPrice" DESC NULLS LAST, "createdAt" DESC, "id" DESC)
  WHERE "status" = 'PUBLISHED'
    AND "deletedAt" IS NULL;
