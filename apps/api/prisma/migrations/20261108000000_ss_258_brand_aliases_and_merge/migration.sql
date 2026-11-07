-- SS-258: brand identity aliases, explicit merge links, and brand-scoped
-- promotion referential integrity.
--
-- The alias table is the race-safe uniqueness authority for brand names:
-- `normalizedKey` is produced by the shared application normalizer and is
-- unique across all brands (including soft-deleted ones).

-- CreateEnum
CREATE TYPE "BrandAliasKind" AS ENUM ('NAME', 'NAME_EN', 'LEGACY');

-- CreateTable
CREATE TABLE "BrandAlias" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "rawName" TEXT NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "kind" "BrandAliasKind" NOT NULL DEFAULT 'NAME',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "BrandAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrandAlias_brandId_idx" ON "BrandAlias"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandAlias_normalizedKey_key" ON "BrandAlias"("normalizedKey");

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN "mergedIntoBrandId" TEXT;

-- CreateIndex
CREATE INDEX "Brand_mergedIntoBrandId_idx" ON "Brand"("mergedIntoBrandId");

-- AddForeignKey
ALTER TABLE "BrandAlias" ADD CONSTRAINT "BrandAlias_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_mergedIntoBrandId_fkey" FOREIGN KEY ("mergedIntoBrandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Promotion.brandId was a bare nullable string. Clear impossible legacy
-- references before enforcing the FK; in a healthy catalog this affects zero
-- rows. (SS-258 merge probes report orphans before/after.)
UPDATE "Promotion" pr
SET "brandId" = NULL
WHERE pr."brandId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Brand" b WHERE b.id = pr."brandId");

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Read-only SQL mirror of the application's brand identity normalizer
-- (SS-258). It wraps the SS-216 `normalize_fa` search normalizer and removes
-- tatweel; the application persists alias keys, so this function is used by
-- audit probes and the TS<->SQL parity test, never by runtime reads.
CREATE OR REPLACE FUNCTION brand_name_key(t text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog
AS $fn$
  SELECT nullif(
    btrim(regexp_replace(public.normalize_fa(t), E'\u0640', '', 'g')),
    ''
  )
$fn$;
