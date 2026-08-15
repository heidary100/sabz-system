-- CreateEnum
CREATE TYPE "PartnerDocumentType" AS ENUM ('BUSINESS_LICENSE', 'NATIONAL_ID', 'TAX_REGISTRATION', 'SUPPORTING');

-- DropIndex
DROP INDEX "Partner_approvalStatus_idx";

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "reviewNotes" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ALTER COLUMN "approvalStatus" SET DEFAULT 'DRAFT';

-- CreateTable
CREATE TABLE "BusinessDocument" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "type" "PartnerDocumentType" NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "BusinessDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessDocument_storageKey_key" ON "BusinessDocument"("storageKey");

-- CreateIndex
CREATE INDEX "BusinessDocument_partnerId_deletedAt_idx" ON "BusinessDocument"("partnerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Partner_approvalStatus_submittedAt_idx" ON "Partner"("approvalStatus", "submittedAt");

-- AddForeignKey
ALTER TABLE "BusinessDocument" ADD CONSTRAINT "BusinessDocument_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
