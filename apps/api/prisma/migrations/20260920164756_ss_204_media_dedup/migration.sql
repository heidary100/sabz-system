-- AlterTable
ALTER TABLE "ProductMedia" ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "sourceUrl" TEXT;

-- CreateIndex
CREATE INDEX "ProductMedia_contentHash_idx" ON "ProductMedia"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMedia_productId_sourceUrl_key" ON "ProductMedia"("productId", "sourceUrl");
