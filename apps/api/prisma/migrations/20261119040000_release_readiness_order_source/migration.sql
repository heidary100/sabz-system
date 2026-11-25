-- SS-900 Part II: exchange-rate snapshot on each order line.
ALTER TABLE "OrderItem"
ADD COLUMN "sourceCurrency" "PriceSourceCurrency",
ADD COLUMN "sourceAmount" DECIMAL(18,2),
ADD COLUMN "sourceRate" DECIMAL(18,6),
ADD COLUMN "sourceRateId" TEXT;
