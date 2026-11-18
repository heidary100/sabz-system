/*
  Warnings:

  - Added the required column `attributeId` to the `ProductAttributeValue` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AttributeValueType" AS ENUM ('TEXT', 'NUMBER', 'BOOLEAN', 'SELECT', 'MULTI_SELECT');

ALTER TYPE "NotificationType" ADD VALUE 'CHAT_MESSAGE';
ALTER TYPE "NotificationType" ADD VALUE 'CHAT_REPLY';

-- CreateEnum
CREATE TYPE "CurrencyCode" AS ENUM ('USD', 'AED');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ChatConversationStatus" AS ENUM ('OPEN', 'PENDING', 'CLOSED');

-- CreateEnum
CREATE TYPE "ChatSenderType" AS ENUM ('CUSTOMER', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('INITIATED', 'REDIRECTED', 'VERIFIED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProductProcessingStatus" AS ENUM ('NONE', 'PENDING', 'PROCESSED', 'SKIPPED', 'FAILED');

-- AlterTable
ALTER TABLE "Attribute" ADD COLUMN     "description" TEXT,
ADD COLUMN     "isComparable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unit" TEXT,
ADD COLUMN     "valueType" "AttributeValueType" NOT NULL DEFAULT 'TEXT';

-- AlterTable
ALTER TABLE "AttributeValue" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "normalizedValue" TEXT,
ADD COLUMN     "numericValue" DECIMAL(18,4),
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "category" TEXT,
ADD COLUMN     "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "customerNationalId" VARCHAR(10),
ADD COLUMN     "note" VARCHAR(1000),
ADD COLUMN     "paymentProvider" TEXT;

-- AlterTable (SS-900): attributeId is added nullable, backfilled from the
-- existing option join, then tightened. Existing product spec rows are never
-- dropped or rewritten beyond this derivation.
ALTER TABLE "ProductAttributeValue" ADD COLUMN     "attributeId" TEXT,
ADD COLUMN     "updatedBy" TEXT,
ADD COLUMN     "valueBoolean" BOOLEAN,
ADD COLUMN     "valueNumber" DECIMAL(18,4),
ADD COLUMN     "valueText" TEXT,
ALTER COLUMN "attributeValueId" DROP NOT NULL;

UPDATE "ProductAttributeValue" pav
SET "attributeId" = av."attributeId"
FROM "AttributeValue" av
WHERE pav."attributeValueId" = av."id"
  AND pav."attributeId" IS NULL;

ALTER TABLE "ProductAttributeValue" ALTER COLUMN "attributeId" SET NOT NULL;

-- Existing importer attributes with option rows keep their select semantics;
-- untyped definitions become concrete SELECT definitions so the admin can
-- edit them without guessing their value domain.
UPDATE "Attribute" a
SET "valueType" = 'SELECT'
WHERE EXISTS (
  SELECT 1 FROM "AttributeValue" av WHERE av."attributeId" = a."id"
)
AND a."valueType" = 'TEXT';

UPDATE "Attribute" SET "isComparable" = true WHERE "type" = 'SPEC';

-- AlterTable
ALTER TABLE "ProductMedia" ADD COLUMN     "backgroundRemoved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "height" INTEGER,
ADD COLUMN     "width" INTEGER,
ADD COLUMN     "originalHeight" INTEGER,
ADD COLUMN     "originalMimeType" TEXT,
ADD COLUMN     "originalSizeBytes" INTEGER,
ADD COLUMN     "originalStorageKey" TEXT,
ADD COLUMN     "originalWidth" INTEGER,
ADD COLUMN     "previousStorageKey" TEXT,
ADD COLUMN     "previousThumbnailKey" TEXT,
ADD COLUMN     "processedAt" TIMESTAMP(3),
ADD COLUMN     "processingError" TEXT,
ADD COLUMN     "processingModel" TEXT,
ADD COLUMN     "processingStatus" "ProductProcessingStatus" NOT NULL DEFAULT 'NONE';

-- CreateTable
CREATE TABLE "CurrencyRate" (
    "id" TEXT NOT NULL,
    "currency" "CurrencyCode" NOT NULL,
    "rialPerUnit" DECIMAL(18,2) NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CurrencyRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ChatConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ChatConversationStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" TEXT,
    "subject" TEXT,
    "contextUrl" VARCHAR(2048),
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCustomerMessageAt" TIMESTAMP(3),
    "lastAdminMessageAt" TIMESTAMP(3),
    "unreadForAdmin" INTEGER NOT NULL DEFAULT 0,
    "unreadForCustomer" INTEGER NOT NULL DEFAULT 0,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderType" "ChatSenderType" NOT NULL,
    "senderUserId" TEXT,
    "body" VARCHAR(4000) NOT NULL,
    "contextUrl" VARCHAR(2048),
    "clientMessageId" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'INITIATED',
    "amount" DECIMAL(12,2) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "providerOrderId" TEXT,
    "providerReferenceId" TEXT,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "callbackTokenHash" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "failedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "signatureVerified" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userId" TEXT NOT NULL,
    "soundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "browserPushEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryAttribute" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isFilterable" BOOLEAN NOT NULL DEFAULT false,
    "isComparable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "CategoryAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CurrencyRate_currency_effectiveAt_idx" ON "CurrencyRate"("currency", "effectiveAt");

-- CreateIndex
CREATE INDEX "ChatConversation_userId_lastMessageAt_idx" ON "ChatConversation"("userId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "ChatConversation_status_lastMessageAt_idx" ON "ChatConversation"("status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "ChatConversation_assignedToId_status_idx" ON "ChatConversation"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_createdAt_idx" ON "ChatMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_senderUserId_idx" ON "ChatMessage"("senderUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_conversationId_clientMessageId_key" ON "ChatMessage"("conversationId", "clientMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_idempotencyKey_key" ON "PaymentAttempt"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentAttempt_orderId_createdAt_idx" ON "PaymentAttempt"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentAttempt_provider_status_idx" ON "PaymentAttempt"("provider", "status");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_provider_receivedAt_idx" ON "PaymentWebhookEvent"("provider", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentWebhookEvent_provider_eventId_key" ON "PaymentWebhookEvent"("provider", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "PushSubscription_failedAt_idx" ON "PushSubscription"("failedAt");

-- CreateIndex
CREATE INDEX "CategoryAttribute_categoryId_sortOrder_idx" ON "CategoryAttribute"("categoryId", "sortOrder");

-- CreateIndex
CREATE INDEX "CategoryAttribute_attributeId_idx" ON "CategoryAttribute"("attributeId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryAttribute_categoryId_attributeId_key" ON "CategoryAttribute"("categoryId", "attributeId");

-- CreateIndex
CREATE INDEX "Attribute_valueType_idx" ON "Attribute"("valueType");

-- CreateIndex
CREATE INDEX "AttributeValue_attributeId_sortOrder_idx" ON "AttributeValue"("attributeId", "sortOrder");

-- CreateIndex
CREATE INDEX "Notification_category_createdAt_idx" ON "Notification"("category", "createdAt");

-- CreateIndex
CREATE INDEX "ProductAttributeValue_productId_attributeId_idx" ON "ProductAttributeValue"("productId", "attributeId");

-- CreateIndex
CREATE INDEX "ProductAttributeValue_attributeId_valueText_idx" ON "ProductAttributeValue"("attributeId", "valueText");

-- CreateIndex
CREATE INDEX "ProductAttributeValue_attributeId_valueNumber_idx" ON "ProductAttributeValue"("attributeId", "valueNumber");

-- CreateIndex
CREATE INDEX "ProductAttributeValue_attributeId_valueBoolean_idx" ON "ProductAttributeValue"("attributeId", "valueBoolean");

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryAttribute" ADD CONSTRAINT "CategoryAttribute_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryAttribute" ADD CONSTRAINT "CategoryAttribute_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "Attribute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "Attribute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data-integrity guards Prisma cannot express. These are additive and do not
-- touch existing rows: every legacy product spec already has exactly one
-- option reference.
CREATE UNIQUE INDEX "ProductAttributeValue_productId_attributeId_scalar_key"
  ON "ProductAttributeValue" ("productId", "attributeId")
  WHERE "attributeValueId" IS NULL;

ALTER TABLE "ProductAttributeValue"
  ADD CONSTRAINT "ProductAttributeValue_exactly_one_value_check"
  CHECK (
    (("attributeValueId" IS NOT NULL)::int
     + ("valueText" IS NOT NULL)::int
     + ("valueNumber" IS NOT NULL)::int
     + ("valueBoolean" IS NOT NULL)::int) = 1
  );

ALTER TABLE "CurrencyRate"
  ADD CONSTRAINT "CurrencyRate_positive_check"
  CHECK ("rialPerUnit" > 0);

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_customerNationalId_format_check"
  CHECK ("customerNationalId" IS NULL OR "customerNationalId" ~ '^[0-9]{10}$');

-- At most one non-closed support conversation per customer. History is kept
-- when a conversation closes; the widget reuses the open row.
CREATE UNIQUE INDEX "ChatConversation_userId_open_key"
  ON "ChatConversation" ("userId")
  WHERE "status" <> 'CLOSED';

ALTER TABLE "ChatMessage"
  ADD CONSTRAINT "ChatMessage_body_nonempty_check"
  CHECK (length(btrim("body")) > 0);

ALTER TABLE "CategoryAttribute"
  ADD CONSTRAINT "CategoryAttribute_sortOrder_nonnegative_check"
  CHECK ("sortOrder" >= 0);
