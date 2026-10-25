-- SS-251: structural enforcement of the sale-price invariant.
-- The service-level rule (variants.service validatePricing, SS-201) covers
-- admin create/update; the importer (woo-write) drops a compareAtPrice that
-- cannot satisfy it. This CHECK closes the remaining paths — direct SQL,
-- future batch endpoints, anything that bypasses the service — so a row
-- with compareAtPrice <= price cannot exist regardless of writer.
--
-- Existing data verified clean before this migration (2026-10-24 audit:
-- 13 compareAt rows, 0 violations; live check re-run at apply time).
--
-- Drift note: Prisma does not model CHECK constraints, so a future
-- `migrate diff --from-migrations --to-schema-datamodel` may propose dropping
-- this constraint — reviewers must keep it (same discipline as the SS-216
-- function/expression indexes, which live outside the datamodel too).

ALTER TABLE "ProductVariant"
  ADD CONSTRAINT "ProductVariant_compareAt_gt_price_check"
  CHECK ("compareAtPrice" IS NULL OR "compareAtPrice" > "price");
