-- SS-258 baseline probes. Read-only. Run BEFORE `brand:merge --apply`.
-- Paste the output into the implementation PR.

\echo '== brand totals =='
SELECT
  count(*) AS total_brands,
  count(*) FILTER (WHERE "deletedAt" IS NULL) AS active_brands,
  count(*) FILTER (WHERE "deletedAt" IS NOT NULL) AS soft_deleted_brands
FROM "Brand";

\echo '== product totals =='
SELECT
  count(*) AS total_products,
  count(*) FILTER (WHERE "deletedAt" IS NULL) AS live_products,
  count(*) FILTER (WHERE "brandId" IS NULL) AS unbranded_products,
  count(*) FILTER (WHERE "brandId" IS NOT NULL) AS branded_products
FROM "Product";

\echo '== promotion totals =='
SELECT
  count(*) AS total_promotions,
  count(*) FILTER (WHERE "brandId" IS NOT NULL) AS brand_scoped_promotions
FROM "Promotion";

\echo '== target brands =='
WITH target(slug) AS (VALUES
  ('green-lion'), ('green-lion-2'),
  ('porodo'), ('porodo-2'),
  ('powerology'), ('powerology-2'),
  ('biva'), ('biva-2'),
  ('ay-dyta'), ('adata'),
  ('avrykv'), ('orico'),
  ('vryty'), ('verity')
)
SELECT
  b.id, b.name, b."nameEn", b.slug, b."deletedAt", b."mergedIntoBrandId",
  count(p.id) FILTER (WHERE p."deletedAt" IS NULL) AS live_products,
  count(p.id) AS all_products,
  (SELECT count(*) FROM "Promotion" pr WHERE pr."brandId" = b.id) AS promotions
FROM "Brand" b
LEFT JOIN "Product" p ON p."brandId" = b.id
WHERE b.slug IN (SELECT slug FROM target)
GROUP BY b.id
ORDER BY b.slug;

\echo '== normalized collision groups (expected before merge: biva, green lion, porodo, powerology) =='
WITH keys AS (
  SELECT id, name, "nameEn", slug, 'name' AS source, brand_name_key(name) AS key
  FROM "Brand"
  UNION ALL
  SELECT id, name, "nameEn", slug, 'nameEn', brand_name_key("nameEn")
  FROM "Brand"
  WHERE "nameEn" IS NOT NULL
)
SELECT
  key,
  count(*) AS n,
  array_agg(name || ' [' || slug || '] (' || source || ')' ORDER BY source) AS members
FROM keys
WHERE key IS NOT NULL
GROUP BY key
HAVING count(*) > 1
ORDER BY key;

\echo '== promotion orphans (expected 0) =='
SELECT pr.id, pr.code, pr."brandId"
FROM "Promotion" pr
LEFT JOIN "Brand" b ON b.id = pr."brandId"
WHERE pr."brandId" IS NOT NULL AND b.id IS NULL;
