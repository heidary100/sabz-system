-- CreateTable
CREATE TABLE "CategoryPriceRule" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "type" "PromotionType" NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "CategoryPriceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPriceOverride" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "PromotionType" NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "ProductPriceOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CategoryPriceRule_categoryId_isActive_idx" ON "CategoryPriceRule"("categoryId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ProductPriceOverride_productId_key" ON "ProductPriceOverride"("productId");

-- CreateIndex
CREATE INDEX "ProductPriceOverride_productId_isActive_idx" ON "ProductPriceOverride"("productId", "isActive");

-- AddForeignKey
ALTER TABLE "CategoryPriceRule" ADD CONSTRAINT "CategoryPriceRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPriceOverride" ADD CONSTRAINT "ProductPriceOverride_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
