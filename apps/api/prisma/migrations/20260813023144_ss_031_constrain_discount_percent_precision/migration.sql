/*
  Warnings:

  - You are about to alter the column `discountPercent` on the `PartnerTier` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(5,2)`.

*/
-- AlterTable
ALTER TABLE "PartnerTier" ALTER COLUMN "discountPercent" SET DATA TYPE DECIMAL(5,2);
