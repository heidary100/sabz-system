-- CreateEnum
CREATE TYPE "PriceSourceCurrency" AS ENUM ('RIAL', 'USD', 'AED');

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "imageHeight" INTEGER,
ADD COLUMN     "imageMimeType" TEXT,
ADD COLUMN     "imageSizeBytes" INTEGER,
ADD COLUMN     "imageStorageKey" TEXT,
ADD COLUMN     "imageUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "imageWidth" INTEGER;

-- AlterTable
ALTER TABLE "ChatConversation" ADD COLUMN     "contextKind" VARCHAR(40),
ADD COLUMN     "contextLabel" VARCHAR(300),
ADD COLUMN     "contextTitle" VARCHAR(300),
ADD COLUMN     "contextUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "contextKind" VARCHAR(40),
ADD COLUMN     "contextLabel" VARCHAR(300),
ADD COLUMN     "contextTitle" VARCHAR(300);

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "compareAtSourceAmount" DECIMAL(18,2),
ADD COLUMN     "priceSourceAmount" DECIMAL(18,2),
ADD COLUMN     "priceSourceCurrency" "PriceSourceCurrency" NOT NULL DEFAULT 'RIAL',
ADD COLUMN     "priceSourceRate" DECIMAL(18,6),
ADD COLUMN     "priceSourceRateAt" TIMESTAMP(3),
ADD COLUMN     "priceSourceRateId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Category_imageStorageKey_key" ON "Category"("imageStorageKey");


-- SS-900 Part II backfill: legacy variants are authored in Rial. Preserve the
-- authored amounts alongside the new source-currency audit fields.
UPDATE "ProductVariant"
SET "priceSourceAmount" = "price",
    "compareAtSourceAmount" = "compareAtPrice"
WHERE "priceSourceAmount" IS NULL;

-- Backend-owned default footer (SS-900 Part II). A fresh environment receives
-- the verified footer content through the migration; an existing custom row is
-- never overwritten. `copyright` stays null so the storefront renders the
-- current Jalali year rather than a stale literal.
INSERT INTO "SiteSetting" ("key", "value", "version", "updatedBy", "createdAt", "updatedAt")
VALUES (
  'footer',
  $footer$
  {
    "enabled": true,
    "blurb": "سبز سیستم، فروشگاه اینترنتی کالای دیجیتال و لوازم جانبی در شمال کشور. «ارسال سریع»، «ضمانت بهترین قیمت» و «تضمین اصالت کالا» سه اصل اولیه سبز سیستم از نخستین روز تأسیس بوده است.",
    "columns": [
      {
        "title": "فروشگاه",
        "links": [
          { "label": "همه محصولات", "href": "/products" },
          { "label": "همه دسته‌بندی‌ها", "href": "/categories" },
          { "label": "وبلاگ", "href": "/blog" },
          { "label": "درباره ما", "href": "/about" },
          { "label": "تماس با ما", "href": "/contact" },
          { "label": "شرایط و قوانین", "href": "/terms" }
        ]
      }
    ],
    "contact": {
      "address": "ساری – بلوار پاسداران – روبروی مرکز تخصصی پرتو مازند – بازرگانی سبز سیستم",
      "phone": "۰۲۱-۹۱۳۰۱۹۰۰",
      "email": "info@sabzsistem.com",
      "hours": "شنبه تا چهارشنبه ۹ تا ۱۸:۳۰ — پنجشنبه ۹ تا ۱۳:۳۰"
    },
    "socials": [
      { "label": "اینستاگرام", "href": "https://www.instagram.com/sabzsistem", "external": true },
      { "label": "کانال تلگرام", "href": "https://t.me/SabzSisTeM", "external": true },
      { "label": "بله", "href": "https://web.bale.ai/@sabzsistem", "external": true }
    ],
    "legalLinks": [
      { "label": "شرایط و قوانین", "href": "/terms" },
      { "label": "نماد اعتماد الکترونیکی", "href": "https://trustseal.enamad.ir/?id=147499&Code=L40xHynZjPMelCe7vsbe", "external": true },
      { "label": "تضمین قیمت در ترب", "href": "https://torob.com/shop/5732", "external": true }
    ],
    "copyright": null
  }
  $footer$::jsonb,
  1,
  'system',
  NOW(),
  NOW()
)
ON CONFLICT ("key") DO NOTHING;
