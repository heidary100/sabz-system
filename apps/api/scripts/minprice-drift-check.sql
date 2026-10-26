-- SS-259 repeatable drift probe: products whose denormalized minPrice is
-- NULL while they own at least one live PRICED variant (the exact audit
-- query, 2026-10-24). Expected: 0 rows on every environment.
--
-- Run against a database (dev/test/staging/prod):
--   docker exec -i sabz-postgres psql -U sabz -d sabz < apps/api/scripts/minprice-drift-check.sql
--
-- Also checks value drift (stored != aggregate) for rows that DO have a
-- value — that half only holds where no other spec is mid-run with raw
-- fixtures, so on shared test databases expect the first query to be the
-- authoritative one.

-- 1. NULL drift (the SS-259 backfill target) — must always be 0.
SELECT 'NULL-drift' AS check, count(*) AS offending
FROM "Product" p
WHERE p."minPrice" IS NULL
  AND EXISTS (
    SELECT 1 FROM "ProductVariant" v
    WHERE v."productId" = p."id"
      AND v."deletedAt" IS NULL
      AND v."priceStatus" = 'PRICED'
  );

-- 2. Value drift (stored minPrice != live aggregate) — diagnostic.
SELECT 'value-drift' AS check, count(*) AS offending
FROM "Product" p
LEFT JOIN LATERAL (
  SELECT MIN(v."price") AS "expected"
  FROM "ProductVariant" v
  WHERE v."productId" = p."id"
    AND v."deletedAt" IS NULL
    AND v."priceStatus" = 'PRICED'
) agg ON TRUE
WHERE p."minPrice" IS DISTINCT FROM agg."expected";
