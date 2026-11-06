-- SS-257 zero-drift oracle for the catalog-grid cancel/discard path.
--
-- Pattern proven in the SS-248 audit probe (§A.7): checksum of the editable
-- money/stock state before and after an operator flow must be IDENTICAL for
-- any path that claims to write nothing. Cancel/discard in the catalog grid
-- is a pure client-side draft reset — this probe is the database-level proof
-- (the admin vitest suite asserts the UI-level half: zero mutation requests).
--
-- Run before the cancel flow and again after; the hash must match:
--   docker exec -i sabz-postgres psql -U sabz -d sabz < apps/api/scripts/catalog-grid-zero-drift.sql
-- (or against the test/dev database of the environment under test)
--
-- Scope: every live ProductVariant row — id, price, compareAtPrice — plus
-- the aggregate quantityOnHand across qualifying warehouses per variant
-- (the exact values the grid's inline editing can touch). NULL compareAt
-- folds to a stable literal so hash rows are deterministic.

-- 1. The checksum itself. Expected: identical before/after a cancel flow.
SELECT md5(
  string_agg(
    v.id || ':' || v.price::text || '|' || coalesce(v."compareAtPrice"::text, 'NULL')
      || '|' || coalesce(stock.total::text, '0'),
    ',' ORDER BY v.id
  )
) AS editable_state_checksum
FROM "ProductVariant" v
JOIN "Product" p ON p.id = v."productId"
LEFT JOIN LATERAL (
  SELECT SUM(i."quantityOnHand") AS total
  FROM "InventoryItem" i
  JOIN "Warehouse" w ON w.id = i."warehouseId"
  WHERE i."variantId" = v.id
    AND w."deletedAt" IS NULL
    AND w.status = 'ACTIVE'
) stock ON TRUE
WHERE v."deletedAt" IS NULL
  AND p."deletedAt" IS NULL
  AND p.status <> 'ARCHIVED';

-- 2. Structural invariants the cancel path must never disturb (diagnostics).
-- 2a. The SS-251 CHECK must still hold for every row (0 = healthy).
SELECT 'compareAt-invariant' AS check, count(*) AS offending
FROM "ProductVariant"
WHERE "deletedAt" IS NULL
  AND "compareAtPrice" IS NOT NULL
  AND "compareAtPrice" <= price;

-- 2b. minPrice must still equal the live aggregate (0 = healthy; the same
-- caveat as the SS-259 probe applies to the value half on shared databases).
SELECT 'minprice-drift' AS check, count(*) AS offending
FROM "Product" p
LEFT JOIN LATERAL (
  SELECT MIN(v.price) AS expected
  FROM "ProductVariant" v
  WHERE v."productId" = p.id
    AND v."deletedAt" IS NULL
    AND v."priceStatus" = 'PRICED'
) agg ON TRUE
WHERE p."minPrice" IS DISTINCT FROM agg.expected;
