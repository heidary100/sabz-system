-- SS-284B guardrails:
-- 1) database-enforced demo apply lease with monotonic fencing generation;
-- 2) durable demo-seed operation journal with immutable intent and completion;
-- 3) partial uniqueness for demo ownership markers;
-- 4) one-publication-per-operation link for atomic retry semantics;
-- 5) media provenance hashes for demo-owned artifacts.
--
-- Prisma 6.19.3 does not document automatic transaction wrapping for
-- PostgreSQL migrations. The explicit block below makes the DDL atomic when
-- the runner sends this file as a single script. Preflight checks are placed
-- before every DDL statement so a compatibility failure leaves the schema
-- unchanged even if a runner executes statements outside a transaction.
--
-- This migration is intentionally fail-closed. If historical demo duplicates
-- already exist, the DO blocks raise a diagnostic and the migration aborts
-- without deleting or rewriting any records.

BEGIN;

-- Preflight: duplicate demo campaign markers.
DO $$
DECLARE
  duplicate_name TEXT;
BEGIN
  SELECT "internalName" INTO duplicate_name
  FROM "MerchCampaign"
  WHERE "internalName" LIKE 'homepage-demo:%'
  GROUP BY "internalName"
  HAVING count(*) > 1
  LIMIT 1;

  IF duplicate_name IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot add demo campaign uniqueness: duplicate internalName "%" already exists',
      duplicate_name;
  END IF;
END $$;

-- Preflight: duplicate demo media markers.
DO $$
DECLARE
  duplicate_name TEXT;
BEGIN
  SELECT "originalName" INTO duplicate_name
  FROM "MerchMedia"
  WHERE "originalName" LIKE 'homepage-demo-%'
  GROUP BY "originalName"
  HAVING count(*) > 1
  LIMIT 1;

  IF duplicate_name IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot add demo media uniqueness: duplicate originalName "%" already exists',
      duplicate_name;
  END IF;
END $$;

CREATE TABLE "HomepageDemoSeedLock" (
  "id" TEXT NOT NULL,
  "ownerToken" TEXT,
  "fencingGeneration" INTEGER NOT NULL DEFAULT 0,
  "leaseExpiresAt" TIMESTAMP(3),
  "operationId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HomepageDemoSeedLock_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HomepageDemoSeedLock_owner_lease_check"
    CHECK (("ownerToken" IS NULL) = ("leaseExpiresAt" IS NULL)),
  CONSTRAINT "HomepageDemoSeedLock_fencingGeneration_check"
    CHECK ("fencingGeneration" >= 0)
);

INSERT INTO "HomepageDemoSeedLock" ("id", "updatedAt")
VALUES ('homepage-demo', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE "HomepageDemoSeedOperation" (
  "id" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'STARTED',
  "planHash" TEXT,
  "intentHash" TEXT,
  "baselineHash" TEXT,
  "intent" JSONB,
  "result" JSONB,
  "backupPath" TEXT,
  "backupChecksum" TEXT,
  "backupRevision" INTEGER,
  "publicationId" TEXT,
  "publicationVersion" INTEGER,
  "draftRevision" INTEGER,
  "affectedMediaIds" JSONB NOT NULL DEFAULT '[]',
  "acknowledgedMediaIds" JSONB NOT NULL DEFAULT '[]',
  "steps" JSONB NOT NULL DEFAULT '{}',
  "failureReason" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HomepageDemoSeedOperation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HomepageDemoSeedOperation_planHash_check"
    CHECK ("planHash" IS NULL OR "planHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "HomepageDemoSeedOperation_intentHash_check"
    CHECK ("intentHash" IS NULL OR "intentHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "HomepageDemoSeedOperation_baselineHash_check"
    CHECK ("baselineHash" IS NULL OR "baselineHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "HomepageDemoSeedOperation_state_check"
    CHECK ("state" IN (
      'STARTED', 'PLANNED', 'BACKED_UP',
      'MEDIA_UPLOAD_STARTED', 'MEDIA_WRITTEN', 'MEDIA_READY',
      'CAMPAIGN_WRITE_STARTED', 'CAMPAIGN_WRITTEN', 'CAMPAIGNS_READY',
      'BLOG_DRAFT_STARTED', 'BLOG_DRAFT_WRITTEN', 'BLOG_DRAFTS_READY',
      'MEDIA_ORPHAN_VERIFIED', 'MEDIA_CONFLICT',
      'PUBLISHED', 'DRAFT_READY', 'COMPLETED', 'FAILED'
    )),
  CONSTRAINT "HomepageDemoSeedOperation_completion_check"
    CHECK (
      ("state" <> 'COMPLETED' OR "draftRevision" IS NOT NULL)
      AND ("publicationId" IS NULL OR "publicationVersion" IS NOT NULL)
    )
);

CREATE INDEX "HomepageDemoSeedOperation_state_startedAt_idx"
  ON "HomepageDemoSeedOperation"("state", "startedAt");

CREATE UNIQUE INDEX "HomepageDemoSeedOperation_publicationId_key"
  ON "HomepageDemoSeedOperation"("publicationId");

-- One guarded demo operation may create at most one homepage publication,
-- even if application logic regresses. Existing non-demo publications have a
-- NULL value and are unaffected.
ALTER TABLE "HomepagePublication"
  ADD COLUMN "demoSeedOperationId" TEXT;

CREATE UNIQUE INDEX "HomepagePublication_demoSeedOperationId_key"
  ON "HomepagePublication"("demoSeedOperationId");

-- A completed journal may only reference an existing publication. The
-- transaction-level completion validation additionally checks operation ID and
-- version equality.
ALTER TABLE "HomepageDemoSeedOperation"
  ADD CONSTRAINT "HomepageDemoSeedOperation_publicationId_fkey"
  FOREIGN KEY ("publicationId") REFERENCES "HomepagePublication"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Demo media provenance hashes. Ordinary/legacy rows remain NULL and are not
-- treated as reusable by the demo seed.
ALTER TABLE "MerchMedia"
  ADD COLUMN "sourceSha256" TEXT,
  ADD COLUMN "processedSha256" TEXT,
  ADD COLUMN "thumbnailSha256" TEXT;

CREATE UNIQUE INDEX "MerchCampaign_homepage_demo_internalName_key"
  ON "MerchCampaign"("internalName")
  WHERE "internalName" LIKE 'homepage-demo:%';

CREATE UNIQUE INDEX "MerchMedia_homepage_demo_originalName_key"
  ON "MerchMedia"("originalName")
  WHERE "originalName" LIKE 'homepage-demo-%';

COMMIT;
