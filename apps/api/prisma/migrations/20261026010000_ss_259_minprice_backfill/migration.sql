-- SS-259: backfill Product.minPrice for rows that acquired live PRICED
-- variants through writes that bypassed recomputeProductMinPrice.
--
-- Audit 2026-10-24 (ux-redesign-audit §A.1): 23 PUBLISHED products had
-- minPrice IS NULL despite owning live PRICED variants — all created
-- 2026-09-25 (SS-217 day) via raw direct-DB writes, never touched by a
-- service since (updatedAt == createdAt). The SS-217 backfill was correct;
-- the drift came from non-service writers, which the service hooks cannot
-- reach. Consequences fixed here: those products were invisible in
-- DB-side price sorts (NULLS LAST) and broke the denormalized-column
-- contract.
--
-- Idempotent: touches only NULL rows, so re-running is a no-op. The same
-- statement shape as the SS-217 backfill, restricted to the drifted set.
-- Repeatable drift probe: scripts/minprice-drift-check.sql (0 rows expected).

UPDATE "Product" p
SET "minPrice" = agg."mp"
FROM (
  SELECT "productId", MIN("price") AS "mp"
  FROM "ProductVariant"
  WHERE "deletedAt" IS NULL
    AND "priceStatus" = 'PRICED'
  GROUP BY "productId"
) agg
WHERE agg."productId" = p."id"
  AND p."minPrice" IS NULL;
