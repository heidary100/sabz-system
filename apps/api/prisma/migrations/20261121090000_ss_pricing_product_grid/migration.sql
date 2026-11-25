-- SS-235 / pricing-grid specification: product sale price, schedule, B2B
-- partner price, FX recalculation timestamp, category rule scope, and
-- absolute product overrides.
--
-- IMPORTANT DATA MIGRATION (compareAtPrice semantics):
-- The legacy `ProductVariant.compareAtPrice` was the PRE-DISCOUNT reference
-- mark and was always greater than `price` (SS-251 CHECK). The specification
-- asks for `discountedPrice`, which is the promotional selling price and is
-- therefore always LOWER than the regular price. A blind rename would invert
-- the meaning. The migration preserves the customer-facing pair:
--     old price        -> new discountedPrice (the amount customers paid)
--     old compareAtPrice -> new price          (the regular/was price)
-- Rows without a sale keep their price unchanged and get no discountedPrice.
-- The legacy source-currency audit amounts are moved the same way.

ALTER TABLE "ProductVariant"
  ADD COLUMN "discountedPrice" DECIMAL(12,2),
  ADD COLUMN "discountStartsAt" TIMESTAMP(3),
  ADD COLUMN "discountEndsAt" TIMESTAMP(3),
  ADD COLUMN "partnerPrice" DECIMAL(12,2),
  ADD COLUMN "priceUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "discountSourceAmount" DECIMAL(18,2);

-- The legacy check compares compareAtPrice to price; the backfill below
-- intentionally swaps those meanings, so the old constraint must go first.
ALTER TABLE "ProductVariant"
  DROP CONSTRAINT IF EXISTS "ProductVariant_compareAt_gt_price_check";

UPDATE "ProductVariant"
SET
  "discountedPrice" = "price",
  "price" = "compareAtPrice",
  "discountSourceAmount" = "priceSourceAmount",
  "priceSourceAmount" = "compareAtSourceAmount",
  "priceUpdatedAt" = CURRENT_TIMESTAMP
WHERE "compareAtPrice" IS NOT NULL;

ALTER TABLE "ProductVariant"
  DROP COLUMN "compareAtPrice",
  DROP COLUMN "compareAtSourceAmount";

ALTER TABLE "ProductVariant"
  ADD CONSTRAINT "ProductVariant_discounted_lt_price_check"
  CHECK (
    "discountedPrice" IS NULL
    OR ("discountedPrice" > 0 AND "discountedPrice" < "price")
  ),
  ADD CONSTRAINT "ProductVariant_discount_window_check"
  CHECK (
    "discountStartsAt" IS NULL
    OR "discountEndsAt" IS NULL
    OR "discountEndsAt" > "discountStartsAt"
  ),
  ADD CONSTRAINT "ProductVariant_partner_price_check"
  CHECK (
    "partnerPrice" IS NULL
    OR ("partnerPrice" > 0 AND "partnerPrice" < "price")
  );

-- Category rules gain an explicit direct-vs-descendants scope.
ALTER TABLE "CategoryPriceRule"
  ADD COLUMN "includeDescendants" BOOLEAN NOT NULL DEFAULT false;

-- Product overrides can now carry an absolute final Rial price instead of a
-- percent/fixed-amount adjustment. Existing rows keep their adjustment.
ALTER TABLE "ProductPriceOverride"
  ALTER COLUMN "type" DROP NOT NULL,
  ALTER COLUMN "value" DROP NOT NULL,
  ADD COLUMN "overridePrice" DECIMAL(12,2);

ALTER TABLE "ProductPriceOverride"
  ADD CONSTRAINT "ProductPriceOverride_shape_check"
  CHECK (
    (
      "type" IS NOT NULL
      AND "value" IS NOT NULL
      AND "overridePrice" IS NULL
    )
    OR (
      "type" IS NULL
      AND "value" IS NULL
      AND "overridePrice" IS NOT NULL
      AND "overridePrice" > 0
    )
  ),
  ADD CONSTRAINT "ProductPriceOverride_adjustment_value_check"
  CHECK ("value" IS NULL OR "value" > 0);

-- Recompute the denormalized minimum price from the migrated values so the
-- storefront listings and search sorts immediately reflect the new columns.
UPDATE "Product" AS p
SET "minPrice" = sub."minPrice"
FROM (
  SELECT
    "productId",
    MIN(
      CASE
        WHEN "discountedPrice" IS NOT NULL THEN "discountedPrice"
        ELSE "price"
      END
    ) AS "minPrice"
  FROM "ProductVariant"
  WHERE "deletedAt" IS NULL AND "priceStatus" = 'PRICED'
  GROUP BY "productId"
) AS sub
WHERE p."id" = sub."productId";

UPDATE "Product" AS p
SET "minPrice" = NULL
WHERE NOT EXISTS (
  SELECT 1 FROM "ProductVariant" v
  WHERE v."productId" = p."id"
    AND v."deletedAt" IS NULL
    AND v."priceStatus" = 'PRICED'
);
