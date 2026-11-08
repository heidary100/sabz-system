-- SS-260: optional personal Iranian National ID (کد ملی) on User.
--
-- Additive and nullable: existing users remain valid with no value and no
-- backfill is required. Deliberately no default, no uniqueness constraint and
-- no index: the field is never queried by value, and a uniqueness policy would
-- be a separate identity-decision with its own privacy/operational review.
--
-- Distinct from Partner.nationalId (business شناسه ملی); that column and its
-- validation semantics are intentionally unchanged.
ALTER TABLE "User" ADD COLUMN "nationalId" TEXT;
