-- SS-258 post-merge probes. Read-only. Run AFTER `brand:merge --apply`.
-- Expected: zero duplicate normalized names, preserved totals, no duplicate
-- references, canonical slugs unchanged, duplicates linked and soft-deleted.

\echo '== normalized alias keys must be unique (expected 0 rows) =='
SELECT
  "normalizedKey",
  count(*) AS n,
  array_agg("rawName" ORDER BY "rawName") AS raw_names,
  array_agg("brandId"::text ORDER BY "brandId"::text) AS brand_ids
FROM "BrandAlias"
GROUP BY "normalizedKey"
HAVING count(*) > 1;

\echo '== active brand name/nameEn collisions (expected 0 rows) =='
WITH keys AS (
  SELECT id, slug, name, 'name' AS source, brand_name_key(name) AS key
  FROM "Brand"
  WHERE "deletedAt" IS NULL
  UNION ALL
  SELECT id, slug, name, 'nameEn', brand_name_key("nameEn")
  FROM "Brand"
  WHERE "deletedAt" IS NULL AND "nameEn" IS NOT NULL
)
SELECT key, count(*) AS n, array_agg(slug || ':' || source ORDER BY slug) AS members
FROM keys
WHERE key IS NOT NULL
GROUP BY key
HAVING count(*) > 1;

\echo '== alias coverage: active name (expected 0 rows) =='
SELECT b.id, b.slug, b.name
FROM "Brand" b
WHERE b."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "BrandAlias" a
    WHERE a."brandId" = b.id
      AND a.kind = 'NAME'
      AND a."rawName" = b.name
  );

\echo '== alias coverage: active nameEn (expected 0 rows) =='
SELECT b.id, b.slug, b."nameEn"
FROM "Brand" b
WHERE b."deletedAt" IS NULL
  AND b."nameEn" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "BrandAlias" a
    WHERE a."brandId" = b.id
      AND a.kind = 'NAME_EN'
      AND a."rawName" = b."nameEn"
  );

\echo '== product totals (must match baseline) =='
SELECT
  count(*) AS total_products,
  count(*) FILTER (WHERE "deletedAt" IS NULL) AS live_products,
  count(*) FILTER (WHERE "brandId" IS NULL) AS unbranded_products,
  count(*) FILTER (WHERE "brandId" IS NOT NULL) AS branded_products
FROM "Product";

\echo '== products still referencing merged duplicates (expected 0 rows) =='
SELECT p.id, p.slug, p."deletedAt", b.slug AS duplicate_slug
FROM "Product" p
JOIN "Brand" b ON b.id = p."brandId"
WHERE b."mergedIntoBrandId" IS NOT NULL;

\echo '== canonical product counts =='
WITH target(slug) AS (VALUES
  ('green-lion'), ('porodo'), ('powerology'), ('biva'),
  ('ay-dyta'), ('avrykv'), ('vryty')
)
SELECT
  b.slug,
  count(p.id) FILTER (WHERE p."deletedAt" IS NULL) AS live_products,
  count(p.id) FILTER (WHERE p."deletedAt" IS NULL AND p.status = 'PUBLISHED') AS published_products,
  count(p.id) AS all_products
FROM "Brand" b
LEFT JOIN "Product" p ON p."brandId" = b.id
WHERE b.slug IN (SELECT slug FROM target)
GROUP BY b.id
ORDER BY b.slug;

\echo '== promotions still referencing merged duplicates (expected 0 rows) =='
SELECT pr.id, pr.code, pr."brandId", b.slug AS duplicate_slug
FROM "Promotion" pr
JOIN "Brand" b ON b.id = pr."brandId"
WHERE b."mergedIntoBrandId" IS NOT NULL;

\echo '== overlapping active brand-scoped promotions (expected 0 unreviewed rows) =='
WITH p AS (
  SELECT id, code, "brandId", "startsAt", "endsAt", type, value, "minQuantity"
  FROM "Promotion"
  WHERE "isActive"
    AND "productId" IS NULL
    AND "categoryId" IS NULL
    AND "brandId" IN (
      SELECT id FROM "Brand"
      WHERE slug IN ('green-lion', 'porodo', 'powerology', 'biva')
    )
)
SELECT a.code AS code_a, b.code AS code_b, a."brandId"
FROM p a
JOIN p b
  ON a."brandId" = b."brandId"
 AND a.id < b.id
 AND a."startsAt" <= b."endsAt"
 AND b."startsAt" <= a."endsAt";

\echo '== merge completion =='
SELECT
  b.slug AS duplicate_slug,
  b.name AS duplicate_name,
  b."deletedAt",
  b."mergedIntoBrandId",
  c.slug AS canonical_slug,
  c.name AS canonical_name,
  c."deletedAt" AS canonical_deleted
FROM "Brand" b
LEFT JOIN "Brand" c ON c.id = b."mergedIntoBrandId"
WHERE b.slug IN (
  'green-lion-2', 'porodo-2', 'powerology-2', 'biva-2',
  'adata', 'orico', 'verity'
)
ORDER BY b.slug;

\echo '== brand totals (total must match baseline; active decreases) =='
SELECT
  count(*) AS total_brands,
  count(*) FILTER (WHERE "deletedAt" IS NULL) AS active_brands,
  count(*) FILTER (WHERE "deletedAt" IS NOT NULL) AS soft_deleted_brands
FROM "Brand";

\echo '== canonical slugs unchanged =='
SELECT slug FROM "Brand"
WHERE slug IN ('green-lion', 'porodo', 'powerology', 'biva',
               'ay-dyta', 'avrykv', 'vryty')
ORDER BY slug;

\echo '== alias ownership for merged identities =='
SELECT
  a."normalizedKey",
  a."rawName",
  a.kind,
  b.slug AS owner_slug,
  b."deletedAt" AS owner_deleted,
  b."mergedIntoBrandId"
FROM "BrandAlias" a
JOIN "Brand" b ON b.id = a."brandId"
WHERE a."normalizedKey" IN (
  'گرین لاین', 'green lion',
  'پرودو', 'porodo',
  'پاورولوژی', 'powerology',
  'بیوا', 'biva',
  'ای دیتا', 'adata',
  'اوریکو', 'orico',
  'وریتی', 'verity'
)
ORDER BY a."normalizedKey";
