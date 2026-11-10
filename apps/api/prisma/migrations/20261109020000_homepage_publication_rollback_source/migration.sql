-- Task 05.4: publication rollback provenance.
-- Additive column only; historical publication snapshots remain immutable.

ALTER TABLE "HomepagePublication"
  ADD COLUMN "rollbackFromPublicationId" TEXT;

CREATE INDEX "HomepagePublication_rollbackFromPublicationId_idx"
  ON "HomepagePublication"("rollbackFromPublicationId");

ALTER TABLE "HomepagePublication"
  ADD CONSTRAINT "HomepagePublication_rollbackFromPublicationId_fkey"
  FOREIGN KEY ("rollbackFromPublicationId") REFERENCES "HomepagePublication"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
