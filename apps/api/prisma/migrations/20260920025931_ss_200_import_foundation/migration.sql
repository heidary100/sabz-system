-- CreateEnum
CREATE TYPE "ImportRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportRecordStatus" AS ENUM ('PENDING', 'IMPORTED', 'UPDATED', 'SKIPPED', 'FAILED');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceSystem" TEXT,
ADD COLUMN     "sourceType" TEXT;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceSystem" TEXT,
ADD COLUMN     "sourceType" TEXT;

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "status" "ImportRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRecord" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceRowHash" TEXT,
    "status" "ImportRecordStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "sourceData" JSONB,
    "productId" TEXT,
    "variantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportRun_sourceSystem_startedAt_idx" ON "ImportRun"("sourceSystem", "startedAt");

-- CreateIndex
CREATE INDEX "ImportRecord_runId_status_idx" ON "ImportRecord"("runId", "status");

-- CreateIndex
CREATE INDEX "ImportRecord_productId_idx" ON "ImportRecord"("productId");

-- CreateIndex
CREATE INDEX "ImportRecord_variantId_idx" ON "ImportRecord"("variantId");

-- CreateIndex
CREATE INDEX "ImportRecord_sourceSystem_sourceId_idx" ON "ImportRecord"("sourceSystem", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRecord_runId_sourceSystem_sourceId_key" ON "ImportRecord"("runId", "sourceSystem", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sourceSystem_sourceId_key" ON "Product"("sourceSystem", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_sourceSystem_sourceId_key" ON "ProductVariant"("sourceSystem", "sourceId");

-- AddForeignKey
ALTER TABLE "ImportRecord" ADD CONSTRAINT "ImportRecord_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ImportRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
