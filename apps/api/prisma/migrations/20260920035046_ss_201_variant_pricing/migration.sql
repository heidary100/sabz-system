-- CreateEnum
CREATE TYPE "PriceStatus" AS ENUM ('PRICED', 'CALL_FOR_PRICE');

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "compareAtPrice" DECIMAL(12,2),
ADD COLUMN     "priceStatus" "PriceStatus" NOT NULL DEFAULT 'PRICED';
