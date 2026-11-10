-- Task 05.1: additive merchandising domain foundation.
--
-- New tables only. Existing catalog/blog/pricing tables are untouched except
-- for Prisma relation metadata, which does not add columns to them.
--
-- Raw constraints below cover invariants Prisma cannot express:
--   * exactly one working homepage draft singleton;
--   * exactly one PUBLISHED homepage publication;
--   * publication schedule/status metadata consistency;
--   * ordered campaign rows and CTA target shape;
--   * campaign windows and media focal ranges.

-- CreateEnum
CREATE TYPE "MerchCampaignType" AS ENUM ('SEASONAL', 'DISCOUNT', 'BRAND', 'CATEGORY', 'NEW_ARRIVAL', 'CLEARANCE', 'EDITORIAL');

-- CreateEnum
CREATE TYPE "MerchCtaKind" AS ENUM ('NONE', 'ALL_PRODUCTS', 'PRODUCT', 'CATEGORY', 'BRAND', 'NEW_ARRIVALS');

-- CreateEnum
CREATE TYPE "MerchMediaSlot" AS ENUM ('HERO_DESKTOP', 'HERO_MOBILE', 'BANNER', 'EDITORIAL');

-- CreateEnum
CREATE TYPE "HomepagePublicationStatus" AS ENUM ('SCHEDULED', 'PUBLISHED', 'SUPERSEDED', 'CANCELLED');

-- CreateTable
CREATE TABLE "MerchCampaign" (
    "id" TEXT NOT NULL,
    "internalName" TEXT NOT NULL,
    "type" "MerchCampaignType" NOT NULL,
    "titleFa" TEXT NOT NULL,
    "eyebrowFa" TEXT,
    "subtitleFa" TEXT,
    "descriptionFa" TEXT,
    "ctaLabelFa" TEXT,
    "ctaKind" "MerchCtaKind" NOT NULL DEFAULT 'NONE',
    "ctaProductId" TEXT,
    "ctaCategoryId" TEXT,
    "ctaBrandId" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "MerchCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchCampaignProduct" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchCampaignProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchCampaignCategory" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchCampaignCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchCampaignBrand" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchCampaignBrand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchMedia" (
    "id" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "thumbnailKey" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "altFa" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "MerchMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchCampaignMedia" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "slot" "MerchMediaSlot" NOT NULL,
    "focalX" INTEGER NOT NULL DEFAULT 50,
    "focalY" INTEGER NOT NULL DEFAULT 50,
    "altFa" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchCampaignMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomepageDraft" (
    "id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "sections" JSONB NOT NULL DEFAULT '[]',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomepageDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomepagePublication" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "HomepagePublicationStatus" NOT NULL DEFAULT 'SCHEDULED',
    "publishAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "sections" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "sourceDraftRevision" INTEGER NOT NULL,
    "nextTransitionAt" TIMESTAMP(3),
    "note" TEXT,
    "createdBy" TEXT,
    "publishedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomepagePublication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MerchCampaign_type_isEnabled_archivedAt_idx" ON "MerchCampaign"("type", "isEnabled", "archivedAt");

-- CreateIndex
CREATE INDEX "MerchCampaign_startsAt_endsAt_idx" ON "MerchCampaign"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "MerchCampaign_priority_idx" ON "MerchCampaign"("priority");

-- CreateIndex
CREATE INDEX "MerchCampaignProduct_campaignId_sortOrder_idx" ON "MerchCampaignProduct"("campaignId", "sortOrder");

-- CreateIndex
CREATE INDEX "MerchCampaignProduct_productId_idx" ON "MerchCampaignProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchCampaignProduct_campaignId_productId_key" ON "MerchCampaignProduct"("campaignId", "productId");

-- CreateIndex
CREATE INDEX "MerchCampaignCategory_campaignId_sortOrder_idx" ON "MerchCampaignCategory"("campaignId", "sortOrder");

-- CreateIndex
CREATE INDEX "MerchCampaignCategory_categoryId_idx" ON "MerchCampaignCategory"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchCampaignCategory_campaignId_categoryId_key" ON "MerchCampaignCategory"("campaignId", "categoryId");

-- CreateIndex
CREATE INDEX "MerchCampaignBrand_campaignId_sortOrder_idx" ON "MerchCampaignBrand"("campaignId", "sortOrder");

-- CreateIndex
CREATE INDEX "MerchCampaignBrand_brandId_idx" ON "MerchCampaignBrand"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchCampaignBrand_campaignId_brandId_key" ON "MerchCampaignBrand"("campaignId", "brandId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchMedia_storageKey_key" ON "MerchMedia"("storageKey");

-- CreateIndex
CREATE INDEX "MerchMedia_deletedAt_idx" ON "MerchMedia"("deletedAt");

-- CreateIndex
CREATE INDEX "MerchMedia_publishedAt_deletedAt_idx" ON "MerchMedia"("publishedAt", "deletedAt");

-- CreateIndex
CREATE INDEX "MerchCampaignMedia_campaignId_sortOrder_idx" ON "MerchCampaignMedia"("campaignId", "sortOrder");

-- CreateIndex
CREATE INDEX "MerchCampaignMedia_mediaId_idx" ON "MerchCampaignMedia"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchCampaignMedia_campaignId_mediaId_slot_key" ON "MerchCampaignMedia"("campaignId", "mediaId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "HomepagePublication_version_key" ON "HomepagePublication"("version");

-- CreateIndex
CREATE INDEX "HomepagePublication_status_publishAt_idx" ON "HomepagePublication"("status", "publishAt");

-- CreateIndex
CREATE INDEX "HomepagePublication_status_nextTransitionAt_idx" ON "HomepagePublication"("status", "nextTransitionAt");

-- CreateIndex
CREATE INDEX "HomepagePublication_publishedAt_idx" ON "HomepagePublication"("publishedAt");

-- AddForeignKey
ALTER TABLE "MerchCampaign" ADD CONSTRAINT "MerchCampaign_ctaProductId_fkey" FOREIGN KEY ("ctaProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchCampaign" ADD CONSTRAINT "MerchCampaign_ctaCategoryId_fkey" FOREIGN KEY ("ctaCategoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchCampaign" ADD CONSTRAINT "MerchCampaign_ctaBrandId_fkey" FOREIGN KEY ("ctaBrandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchCampaignProduct" ADD CONSTRAINT "MerchCampaignProduct_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MerchCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchCampaignProduct" ADD CONSTRAINT "MerchCampaignProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchCampaignCategory" ADD CONSTRAINT "MerchCampaignCategory_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MerchCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchCampaignCategory" ADD CONSTRAINT "MerchCampaignCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchCampaignBrand" ADD CONSTRAINT "MerchCampaignBrand_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MerchCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchCampaignBrand" ADD CONSTRAINT "MerchCampaignBrand_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchCampaignMedia" ADD CONSTRAINT "MerchCampaignMedia_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MerchCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchCampaignMedia" ADD CONSTRAINT "MerchCampaignMedia_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MerchMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Task 05.1 raw invariants -------------------------------------------------

ALTER TABLE "HomepageDraft"
  ADD CONSTRAINT "HomepageDraft_singleton_check"
  CHECK ("id" = 'homepage');

ALTER TABLE "HomepageDraft"
  ADD CONSTRAINT "HomepageDraft_revision_check"
  CHECK ("revision" >= 0 AND "schemaVersion" > 0);

ALTER TABLE "HomepagePublication"
  ADD CONSTRAINT "HomepagePublication_version_check"
  CHECK ("version" > 0 AND "sourceDraftRevision" >= 0 AND "schemaVersion" > 0);

ALTER TABLE "HomepagePublication"
  ADD CONSTRAINT "HomepagePublication_status_metadata_check"
  CHECK (
    ("status" = 'SCHEDULED' AND "publishAt" IS NOT NULL) OR
    ("status" = 'PUBLISHED' AND "publishedAt" IS NOT NULL) OR
    "status" IN ('SUPERSEDED', 'CANCELLED')
  );

-- A filtered unique index is the database-level authority for the one-current
-- publication invariant. Prisma does not model partial indexes.
CREATE UNIQUE INDEX "HomepagePublication_one_published_idx"
  ON "HomepagePublication" ("status")
  WHERE "status" = 'PUBLISHED';

ALTER TABLE "MerchCampaign"
  ADD CONSTRAINT "MerchCampaign_window_check"
  CHECK ("startsAt" IS NULL OR "endsAt" IS NULL OR "endsAt" > "startsAt");

ALTER TABLE "MerchCampaign"
  ADD CONSTRAINT "MerchCampaign_priority_check"
  CHECK ("priority" >= 0);

ALTER TABLE "MerchCampaign"
  ADD CONSTRAINT "MerchCampaign_cta_target_check"
  CHECK (
    ("ctaKind" = 'NONE' AND "ctaProductId" IS NULL AND "ctaCategoryId" IS NULL AND "ctaBrandId" IS NULL) OR
    ("ctaKind" = 'ALL_PRODUCTS' AND "ctaProductId" IS NULL AND "ctaCategoryId" IS NULL AND "ctaBrandId" IS NULL) OR
    ("ctaKind" = 'NEW_ARRIVALS' AND "ctaProductId" IS NULL AND "ctaCategoryId" IS NULL AND "ctaBrandId" IS NULL) OR
    ("ctaKind" = 'PRODUCT' AND "ctaProductId" IS NOT NULL AND "ctaCategoryId" IS NULL AND "ctaBrandId" IS NULL) OR
    ("ctaKind" = 'CATEGORY' AND "ctaProductId" IS NULL AND "ctaCategoryId" IS NOT NULL AND "ctaBrandId" IS NULL) OR
    ("ctaKind" = 'BRAND' AND "ctaProductId" IS NULL AND "ctaCategoryId" IS NULL AND "ctaBrandId" IS NOT NULL)
  );

ALTER TABLE "MerchCampaignProduct"
  ADD CONSTRAINT "MerchCampaignProduct_sortOrder_check"
  CHECK ("sortOrder" >= 0);

ALTER TABLE "MerchCampaignCategory"
  ADD CONSTRAINT "MerchCampaignCategory_sortOrder_check"
  CHECK ("sortOrder" >= 0);

ALTER TABLE "MerchCampaignBrand"
  ADD CONSTRAINT "MerchCampaignBrand_sortOrder_check"
  CHECK ("sortOrder" >= 0);

ALTER TABLE "MerchCampaignMedia"
  ADD CONSTRAINT "MerchCampaignMedia_focal_check"
  CHECK (
    "focalX" BETWEEN 0 AND 100 AND
    "focalY" BETWEEN 0 AND 100 AND
    "sortOrder" >= 0
  );

ALTER TABLE "MerchMedia"
  ADD CONSTRAINT "MerchMedia_size_check"
  CHECK (
    "sizeBytes" > 0 AND
    ("width" IS NULL OR "width" > 0) AND
    ("height" IS NULL OR "height" > 0)
  );
