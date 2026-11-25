# Milestone 2 Deep Audit

> Investigation and planning only. No code was changed. Baseline: commit `0e8c7e0` (Milestone 2 — Storefront Catalog Experience). All findings verified by direct inspection (CSV profiling + codebase reads + 4 parallel research agents). Be critical by instruction: green tests ≠ good product foundation.

## Executive Summary

1. **The WooCommerce export exists** at repo root: `wc-product-export-20-9-2026-1789870382306.csv` (14 MB, Persian-language WooCommerce export, 243 columns). Real profile: **1152 rows** = 1069 simple + 24 variable parents + 59 variations (the `wc -l` count of 6369 is inflated by multi-line HTML descriptions — do not use it). ~1093 sellable products, 60 category paths, 12 brands (+924 unbranded), 29 attribute names, 5170 image refs (4117 distinct, all `sabzsistem.com`), 1079 tags.
2. **The current domain cannot represent the real catalog.** There is no attribute/spec model, no tag model, no SEO model, no source-identity columns, no multi-category support, no compare-at/sale price, no price-on-request state, variant has no options, single required `categoryId`, `Brand` has no `nameEn`/visibility, dimensions/weight exist but weight unit mismatches the export (grams vs `weightKg`). A giant JSON blob must be avoided; a small, deliberate set of normalized additions + one scoped metadata mechanism is recommended.
3. **The media pipeline is well-hardened for single admin uploads but NOT bulk-ready**: no queue/worker, no retry, no content-hash dedup, no per-item reporting, synchronous request processing, video watermark path is fixed-pixel (not proportional), thumbnails inherit the full-size mark and then shrink (mark dominates listing cards). Re-running any naive importer **will duplicate every asset**.
4. **The watermark is too large by configuration, not by accident**: `SIZE_RATIO 0.3` + `MAX 360px` + stacked vertical lockup + `opacity 0.55` + tight margin. Needs proportional redesign with separate thumbnail policy and a fixed video path.
5. **The logo file exists but is orphaned**: `company-logo.png` (141×141, 8-bit colormap, 3.2 KB, green/grey "S" mark, no wordmark) is referenced nowhere. The watermark uses `apps/api/assets/watermark/logo-placeholder.svg`. Do not point the watermark at the 141px PNG as-is (too small, will upscale poorly).
6. **The storefront is a catalog skeleton, not a commercial experience**: no CTA, variants not selectable, no related products, filters break category context (navigate to `/products`), no nested category nav (children never rendered), search is name-only with no SKU/brand support, Vazirmatn is imported but never applied (`body` falls back to system font), all pages `force-dynamic` with no cache/loading/error states, mobile drawer has width + dialog-a11y bugs, cart badge hardcodes `۰`.
7. **Verdict on the 10 critical questions**: (1) No — schema cannot hold the catalog. (2) No — attributes/specs effectively don't exist. (3) No — media pipeline unsafe for bulk. (4) No — watermark not production-appropriate. (5) Yes — logo must become a centralized brand asset. (6) Partially — adjacency tree is fine, but exact-slug matching, direct-only counts, and flat nav waste it. (7) No — nav truncates to 7/10/5 inconsistently with no overflow/children. (8) No — RTL shell is correct but font unwired, icons/separators wrong, mixed FA/EN untested at scale. (9) No — listing/detail degrade with 1000+ products (in-memory price sort, 24 eager cards, no facets). (10) Yes — several demo shortcuts must be corrected (price-on-request, `priceFrom` in-memory sort, slug fallback collisions, `publishedProductCount` semantics, placeholder links/badges).

---

## Current State

- Milestone 2 merged at `0e8c7e0` ("Merge real sabzsistem.com product photos into demo seed"). Prior: SS-129 watermarked thumbnails, SS-120–123 public catalog API, SS-124–128 storefront shell/listing/category/detail/home, SS-130 `stockQuantity` removal, SS-131 23-product demo seed from `sabzsistem.com`.
- Quality gates green (lint, typecheck, unit, integration, e2e, build, fresh Docker startup) — confirmed as baseline, not as product approval.
- Demo seed: 17 categories, 11 brands, 23 products / 24 variants, 29 media, all `PUBLISHED`, dev-only gate (`NODE_ENV=development`), idempotent upserts.
- Two untracked files at repo root (not yet committed): the WooCommerce CSV and `company-logo.png`. Nothing references either.

## Repository Architecture Relevant to This Review

- pnpm monorepo (`apps/api` NestJS, `apps/admin` React+Catalyst, `apps/storefront` Next.js App Router, `packages/types` shared contracts).
- Backend is a modular monolith: catalog lives entirely under `apps/api/src/modules/products/` (products, categories, brands, variants, media, public-catalog, public-media, description-images, inventory module adjacent). There is **no** `modules/media/` or `modules/roles/` (roles live in auth).
- Public API surface (`/api/v1`): `GET /catalog/categories`, `/catalog/brands`, `/catalog/products?q&category&brand&condition&sort&page`, `/catalog/products/:slug`, `/catalog/media/:mediaId[/thumbnail]` — all read-only, server-component consumed with `force-dynamic`, no cache tags.
- Admin is the sole catalog writer (role-gated `OPERATOR`/`ADMIN`); storefront has no commerce actions (cart/account are placeholder pages).
- Media storage: local disk only (`.data/product-media`, `api_product_media` volume), atomic writes, magic-byte MIME validation, sharp + FFmpeg processing, immutable-cache serving. No S3, no BullMQ, no CDN (several docs still claim otherwise — stale, see Documentation section).

## WooCommerce Dataset Analysis

Source: `wc-product-export-20-9-2026-1789870382306.csv`, UTF-8-SIG, Persian headers, 243 columns, **1152 data rows**.

### Data-profile summary

| Dimension | Measurement |
|---|---|
| Rows | 1152 (1069 `simple`, 24 `variable`, 59 `variation`) |
| `منتشر شده` (published) | 1: 1126, 0: 14, -1: 12 (draft/private) |
| `در انبار؟` (stock flag) | 0: 743, 1: 408, backorder: 1 |
| `انبار` (qty, sellable) | 0: 531, empty: 268, then 1/5/3/2/4… (long tail) |
| Prices | Regular set on only 251/1069 simples + 5/59 variations; variable parents 0/24 (expected). Sale (`قیمت فروش ویژه`) set on 12 rows. Range 0–5,890,000,000 (Rial presumably). 818 published simples have **no regular price** → price-on-request / call-for-price pattern, not data error |
| Categories | 60 distinct full paths, depth 1–4 (mode 2–3). Root `کالای دیجیتال` on 981 rows. Top leaves: phone accessories (335), computer accessories (288), storage (204), stock/refurbished (160), laptop-stock (103). `دسته‌ها` redundantly lists the full ancestor chain per product (comma-separated) — products are effectively single-leaf assigned |
| Brands (`برندها`) | 12 distinct: Green Lion 54, Porodo 38, proone 27, Powerology 16, orico 10, vivarex 10, Biva 4, Coteci 3, Verity 3, ANKER 2, Rapoo 1, Apple 1. **924/1093 sellables have no brand** |
| Attributes (`نام N صفت`, N≤22) | 29 distinct names. `برند` 303 (duplicates brand column), `انتخاب رنگ` 85 (55 of 59 variations — the only true variant axis), laptop spec group `پردازنده/رم/حافظه/گرافیک/صفحه نمایش/پورت` 14 each, mobile-spec dotted group `مشخصات کلی.* / پردازنده.* / دوربين.* / حافظه.* / صدا.*` 6 each. Visibility flag: 0: 402, 1: 139. Global flag: 1: 592, 0: 6 |
| `custom_attributes` meta | 912 rows. Free-text spec block, e.g. `ظرفیت: 1 ترابایت\nنوع حافظه: قابل حمل\nنوع اتصال: باسیم`. This is the **real spec store** for most products |
| Descriptions | `توضیحات` set on 1024 sellables (long HTML), `توضیح کوتاه` on 183 |
| Tags (`برچسب‌ها`) | 624 rows, 1079 distinct tags (e.g. گرین لاین 54, اسپیکر 47). Noisy, Persian-variant spellings (`لپ تاپ` 34 vs `لپتاپ` 29) |
| Images (`تصاویر`) | 5170 refs, 4117 distinct URLs, **100% `sabzsistem.com` domain**. Per-product 1–10 (mode 4). 10 sellables have zero images. Variations carry images on only 4/59 |
| `شناسه` (ID) / `شناسه محصول` (SKU) | IDs unique across 1152 rows — usable as `sourceId`. SKU set on 45/59 variations + simples (English product code, e.g. `ADATA HD710 Pro…-1T`) |
| GTIN | 1 row only — ignore as a domain field |
| Weight/dims | `وزن (گرم)` 0 rows, dims 0 rows — columns exist but unused. Do not over-design for them, but keep nullable fields |
| Status extras | `آیا ویژه است؟` 9 featured; `قابل مشاهده در کاتالوگ: visible` on all 1152 (no hidden rows via this flag) |
| English name (`product_english_name`) | 799 rows — high-value, keep as first-class `nameEn` |
| Warranty (`garrantie`, sic) | 711 rows, free text (`گارانتی: 24 ماهه الماس…`) — keep as free-text `warranty` (already exists), normalize later |
| Seller/fulfilment metas | `seller_brand` 382, `stock_name` 378, `send_by` 832, `_stock_name` 951 — all near-constant (`سبز سیستم`) with spelling variants. Display-only trust signals, not normalized entities |
| Subtitle (`newkala_subtitle_product`) | 948 rows — keep as secondary title/subtitle field or metadata |
| `second_image` / `_second_image` | 396/913 rows — legacy hover-image feature; mappable to `sortOrder=1` gallery position, not a new field |
| Wholesale (`wholesale_customer_wholesale_price` 138, `قیمت همکار` 6, others ~1) | Tier-price evidence for future B2B; 115 price-less simples carry a wholesale price. Do not build pricing engine now; preserve raw values |
| SEO | `rank_math_focus_keyword` 952, `rank_math_description` 357, `_yoast_wpseo_metadesc` 132, `rank_math_title` 2. Titles/descriptions worth migrating; scores/social overlays not |
| Video | `product_video_url` 0, `_product_video_url` 3, `product_video_code` 1, `type_vidoe` mostly `0`. Effectively **no video catalog** — keep video pipeline but don't prioritize video import |
| Slugs | No slug column; `_wp_desired_post_slug` 0 rows. Slugs must be generated (transliteration required — Persian names collapse under current `generateSlug`) |
| Tax/shipping/notes | `وضعیت مالیات` all rows (constant), 1 shipping class, no external URLs, no purchase notes — ignore |

### Key dataset insights for design

1. **Two attribute systems coexist**: (a) numbered global/local attributes (`نام N صفت`, mostly hidden `visible=0`, the variant axis `انتخاب رنگ` + laptop/mobile spec groups), (b) `custom_attributes` free-text spec lines (the majority). Any importer must handle both and must not conflate variant-defining vs display-only.
2. **Price absence is a business state**, not dirt: 818 published rows without price + wholesale-only rows + zero-price rows → the domain needs an explicit price-on-request / call-for-price representation (or import-time exclusion policy — a user decision).
3. **Brand column is sparse but brand attribute is dense** (`برند` attr 303 vs `برندها` 169 assignments) — reconcile during import (column wins, attribute fills gaps).
4. **Single-leaf categories with ancestor-chain redundancy** — importer should resolve the deepest path only, creating parents as needed.
5. **Media is large but uniform** (one domain, ~4.5 images/product) — ideal for a hashed, idempotent downloader with concurrency + retries.

## Product Domain Gap Analysis

Current models: `Category`, `Brand`, `Product`, `ProductVariant`, `ProductMedia`, `Warehouse`, `InventoryItem`, `InventoryMovement`, `Reservation`. No attribute/tag/SEO/source-identity models.

### Mapping table (meaningful WooCommerce fields → Sabz)

| WooCommerce data | Sabz field/model | Supported? | Transformation | Problem / recommendation |
|---|---|---|---|---|
| `شناسه` (row ID) | — (new `sourceSystem`+`sourceId`+`sourceType`) | ❌ | Persist `WOOCOMMERCE / <شناسه> / <نوع>` with unique `(sourceSystem, sourceId)` | **P0.** Required for idempotency, updates, reporting. Add to Product + Variant (variation rows need it too) |
| `نوع` (simple/variable/variation) | Product + ProductVariant | ⚠️ | simple→1-variant product; variable→product shell; variation→variant | Variable shells have no price (correct) but publish-gate requires ≥1 variant — importer must attach variations before publishing. Variation matching uses `مادر` (name-based!) — fragile; prefer SKU/ID matching with name fallback |
| `نام` (+ `product_english_name`) | `Product.name` + new `nameEn` | ⚠️ | FA→`name`, EN meta→`nameEn` (799 rows) | Add `nameEn` (search + B2B/SKU contexts). Mixed FA/EN rendering rules needed |
| `توضیح کوتاه` / `توضیحات` | `shortDescription` / `description` | ✅ | Sanitize (existing pipeline), keep HTML | Capacity OK (500ch / 50k). Inline `<img>` in descriptions need the description-image importer path, not product-media path |
| `منتشر شده` (1/0/-1) | `Product.status` | ⚠️ | 1→PUBLISHED (if importable), 0/-1→DRAFT | Decide: import drafts as DRAFT or skip (recommendation: import as DRAFT, excluded from storefront, visible in admin) |
| `قیمت عادی` / `قیمت فروش ویژه` | `Variant.price` only | ⚠️ | regular→`price`; sale→new `compareAtPrice` (nullable) | **P0-ish.** No sale-price field today. 12 rows use it now; electronics promos will grow. Add `compareAtPrice`; enforce `compareAtPrice > price` |
| Missing price (818 rows) | — (new purchasability state) | ❌ | Explicit `priceStatus: PRICED / CALL_FOR_PRICE` or import filter | **P0 decision.** Options: (a) import as non-purchasable draft/hidden, (b) import published with "call for price" UI, (c) skip. Needs user decision; schema must represent it regardless |
| `شناسه محصول` (SKU) | `Variant.sku` (global unique) | ✅ | Direct; simple→single variant SKU | Collision risk across simples sharing codes — importer must dedupe/suffix + report |
| `در انبار؟` + `انبار` qty | Inventory ledger (no variant qty field — SS-130) | ✅ (via ledger) | `INITIAL_STOCK` receipt on DEFAULT warehouse per variant | Works but bulk path must batch receipts (one movement per variant is fine; avoid per-unit rows). `available = onHand − reserved` already derived |
| `دسته‌ها` (chain) | `Product.categoryId` (single, required) | ⚠️ | Deepest path wins; upsert hierarchy by path | Single-category is a real limitation (Woo allows multi). Recommend: keep single primary + add `ProductCategory` secondary join (P1) — or explicitly defer multi-cat with documented loss. Category upsert must be path-keyed + slug-collision-safe |
| `برچسب‌ها` | — (new `Tag` + `ProductTag`) | ❌ | Normalize (trim, ZWNJ-normalize, dedupe `لپ تاپ/لپتاپ`) | 1079 noisy tags. Needed for search/facets. P1 (not P0 — can import without, but lossy) |
| `برندها` + `برند` attr | `Brand` (name/slug/desc-as-nameEn hack) | ⚠️ | Column wins; attr fills gaps; stop storing `nameEn` in `description` | Add `Brand.nameEn` (+ optional `logoKey` activation later). 924 unbranded → nullable brand or "Generic" policy decision |
| `انتخاب رنگ` (+ other variant attrs) | — (new variant-option model) | ❌ | New `Attribute`/`AttributeValue` + `VariantAttributeValue` (variant-defining only) | **P0 design.** Variant currently has display-only `name`. 55/59 variations need structured options or variant UX stays a static list |
| Spec attrs (numbered groups) + `custom_attributes` lines | — (new spec model) | ❌ | New `ProductSpec` (key/value, ordered, source-tagged) OR scoped `attributes` design (see Attributes section) | **P0 design.** 912 + ~300 rows of specs have nowhere to go. Must not be dropped, must not be JSON-blobbed |
| `وزن (گرم)` / dims (all empty) | `weightKg` / `widthCm…` | ⚠️ | grams→kg (`/1000`) when present | Unit mismatch documented; keep fields, no work needed for this dataset |
| `garrantie` (711) | `Product.warranty` | ✅ | Direct free-text | Consider normalization dictionary later (P2) |
| `newkala_subtitle_product` (948) | — (`subtitle` or metadata) | ❌ | New `Product.subtitle` (nullable) or spec-adjacent | Cheap, high-value for cards/detail. Recommend first-class nullable field |
| `seller_brand`/`stock_name`/`send_by` | — | ❌ (intentionally) | Map to single fulfilment-trust-signal component, not columns | Near-constant; do not normalize. Preserve one raw sample per product in import metadata for audit |
| `second_image` | `ProductMedia.sortOrder` | ✅ (by convention) | Treat as gallery position 1 | No new field |
| Wholesale metas (138+6+1+1) | — | ❌ (defer) | Preserve raw in import staging/report, no domain fields yet | Must not be silently dropped; must not trigger a pricing-engine build. Staging-table or `sourceMeta` preservation (see Import Architecture) |
| `type_vidoe`/`product_video_*` (~4) | `ProductMedia VIDEO` | ✅ | Import the ~4 real video refs via video path | Pipeline exists; negligible volume |
| RankMath/Yoast title/desc/keyword | — (new SEO fields) | ❌ | `Product.metaTitle/metaDescription/focusKeyword` (nullable) or `SeoMeta` 1:1 | Titles/descriptions used (357+952 rows); scores/overlays discarded. P1 |
| `_woodmart_new_label`, Elementor, price-chart, slider, SMS, festi*, `content_slider`, etc. | — | ❌ (intentionally ignored) | Documented ignore-list | Theme/plugin internals, no commerce meaning |
| `GTIN…` (1 row) | `Variant.barcode` | ✅ | Map the single row; leave nullable | No action |
| `تصاویر` (5170 refs) | `ProductMedia` | ⚠️ | Bulk downloader → existing `MediaService.upload` path with hash dedup (new `contentHash`/`sourceUrl` columns) | **P0.** No bulk path, no dedup columns, no idempotency today |
| `مادر` (variation→parent link) | `Variant.productId` | ⚠️ | Resolve via SKU→ID→name chain | Name-based (`مادر` = parent *name*) is brittle — importer resolution order must be SKU-first |

### Do-not-force-Woo-into-schema (domain boundary)

- **Add (normalized, small)**: `sourceSystem/sourceId(/sourceType)` on Product+Variant; `Variant.compareAtPrice`; `Variant` options (`Attribute`+`AttributeValue`+`VariantAttributeValue` — variant-defining only); `ProductSpec` (ordered key/value, source-tagged `WOO_ATTR` vs `WOO_CUSTOM`); `Tag`+`ProductTag`; `Product.metaTitle/metaDescription/focusKeyword` (or 1:1 `SeoMeta`); `Product.nameEn` + `Product.subtitle`; `Brand.nameEn`; `ProductMedia.contentHash` + `sourceUrl`; `ProductCategory` secondary join (P1) *or* explicit documented single-category loss.
- **Generic metadata mechanism (scoped, not a blob)**: one `ImportRecord` staging/audit table (source row hash, raw JSON, per-row status, error) + optionally `Product.sourceMeta` (narrow: wholesale values + seller/stock/send_by originals for audit). Explicitly **not** a general-purpose `product.data JSON` escape hatch — ban it in the migration ADR.
- **Intentionally ignored (documented)**: Elementor/Yoast-score/RankMath-score/social-overlay/price-chart/slider/SMS/festi/ tax-class constants / shipping-class singletons.
- **Preserved for future**: wholesale price columns (B2B pricing engine), `count_recommended`/post-views (analytics), cross-sell/upsell IDs (related-products Milestone 3).

## Category Gap Analysis

- Woo: 60 paths, depth 1–4 under single root `کالای دیجیتال`; product rows carry the redundant ancestor chain (resolve deepest only). No images/ordering/counts in export. 14 unpublished + 12 private rows may reference otherwise-empty categories. Near-duplicate node names exist (`ابزار` vs `ابزار آلات` vs `ابزارآلات`, `لپ تاپ` vs `لپتاپ` in tags) — category nodes themselves are clean (60/60 distinct) but sibling-merge review is needed for `All In One` (EN) and `دسته بندی نشده` (uncategorized — must not be imported as a storefront category).
- Sabz: adjacency-list `Category` (`parentId`, `sortOrder`, `isVisible`) — structurally sufficient. Gaps: (a) public API matches **exact slug only** (no subtree inclusion — a parent category page omits child products); (b) `publishedProductCount` counts **direct** products only (parents show 0 despite stocked children — misleading nav pills); (c) no category images/descriptions landing content (Woo has descriptions; we drop them); (d) slug generator strips Persian to fallback UUIDs (import must transliterate or accept opaque slugs + keep FA names).
- Migration behavior: upsert by **path** (not name), slug-collision suffixing with report, skip `دسته بندی نشده`, merge-or-flag EN/duplicate siblings for human review, default `isVisible=true` except empty/unpublished-only branches (import as hidden), preserve `sortOrder` from first-seen order (Woo gives no ordering). Multi-category: keep single primary; secondary join is P1.

## Attribute/Specification Gap Analysis

- Current support: **none**. No attribute tables, columns, or DTOs. Specs survive only as free-text description HTML.
- Dataset reality: variant-defining = `انتخاب رنگ` (85 rows, 55/59 variations, global=1, visible=0 — i.e. defines purchasability but hidden from display, classic Woo pattern). Specification = everything else: laptop group (14 each), mobile dotted group (6 each), `برند` (303, redundant), plus `custom_attributes` lines (912, `key: value` per line).
- Recommended architecture (based on actual data, not theory):
  - `Attribute` (name, slug, `type: VARIANT_OPTION | SPEC`, `isFilterable`, `isGlobal`) + `AttributeValue` (attributeId, value, slug) — seeded from global attrs (`صفت N سراسری=1`) and the dotted mobile namespaces (namespace → group label).
  - `ProductAttributeValue` (spec assignment: productId, attributeValueId, sortOrder, `source: WOO_ATTR|WOO_CUSTOM`) for display/filterable specs.
  - `VariantAttributeValue` (variantId, attributeValueId) for the variant axis (`انتخاب رنگ` first; extensible to storage/RAM later).
  - `custom_attributes` lines parsed (`split on first ':'/'：'/'-'`) into spec assignments with `source=WOO_CUSTOM`; unparseable lines → import report + preserved raw (not dropped, not blobbed into product).
  - Filterable set v1: color, brand, storage-capacity-ish keys (curated allowlist, not auto-everything — 29 names auto-exposed as facets would be noise).
- Explicitly rejected: single `specs JSON` column (unqueryable, unfilterable, drifts); dozens of per-spec tables (over-normalization for 29 names).

## Media Pipeline Audit

- Flow (single upload): Multer temp → 16-byte magic check (`media-validation.ts`) → `randomUUID` storageKey `products/<id>/<uuid>.<ext>` → sharp composite + WEBP-640 thumb (images) / FFmpeg re-encode (video) → `putFile` ×2 → `$transaction` (product `FOR UPDATE` lock, server-owned sortOrder/primary) → audit → temp cleanup with retries. Serving: relative `/api/v1/catalog/media/<uuid>[/thumbnail]`, UUID-gated, published-gate, immutable cache. Storefront uses `next/image` (cards prefer thumbnails, gallery mains use originals) — correct split.
- Bulk verdict: **not ready**. No queue/worker (BullMQ absent), no bulk endpoint, no retry/backoff, no per-item status, no `contentHash`/`sourceUrl`/`processingStatus` columns, synchronous-request processing (one corrupt 200 MB video blocks a worker up to the 10-min FFmpeg timeout), per-product row lock serializes backfills, `secure-image-import.ts` is description-only (5 MB, SSRF-pinned) — no product-media URL importer exists. Price-sort loads full candidate sets in memory (compounds at 1000+ products).
- Idempotent import strategy (design): add `ProductMedia.sourceUrl UNIQUE?` (scoped per product: `UNIQUE(productId, sourceUrl)`) + `contentHash` (sha256 of bytes); importer flow per image: HEAD/GET with timeout → size/MIME guard → hash → skip if `(productId, sourceUrl|hash)` exists → download to staging → run existing `MediaService.upload` → record `ImportRecord` row. Concurrency cap (e.g. 4–8), per-item retries (3, exponential), dead-letter list, dry-run mode (fetch headers + report without writes), resume via `ImportRecord` statuses. Featured = first image → `isPrimary`; gallery order = CSV order → `sortOrder`.

## Logo/Branding Plan

- Reality: `company-logo.png` exists, referenced nowhere. 141×141 8-bit colormap, green/grey "S" glyph, transparent-looking, **no wordmark, no light/dark variants, no vector master**. Watermark uses `apps/api/assets/watermark/logo-placeholder.svg` + bundled Vazirmatn. Header renders a text badge (`س` + `سبز سیستم`), no image logo anywhere; no `public/` brand kit, no favicon.
- Architecture: create a centralized brand asset module — `apps/storefront/public/brand/` (SVG master + PNG fallbacks + `favicon`/`apple-touch-icon` + OG image) and `apps/api/assets/brand/` (watermark-grade master, ≥1024px or SVG). Single `brand.ts` config (name FA/EN, logo URLs, sizes) consumed by header/footer/mobile-nav/metadata + watermark config. Replacement = swap files + config, not component edits.
- Required from user: vector master (SVG) of the real logo + wordmark lockup (FA `سبز سیستم` + optional EN), light/dark or mono variants, usage clearances (min size, background). Until then: keep placeholder, do not upscale the 141px PNG into the watermark (blurry) or header (unprofessional).
- Asset spec: SVG primary; PNG @1x/2x/3x for icons; favicon 32px + ICO; OG 1200×630; watermark master ≥1024px transparent PNG or SVG (sharp renders SVG cleanly at chip sizes).

## Watermark Audit

- Config (`watermark-config.ts`, env-overridable): enabled, company `سبز سیستم`, opacity **0.55**, position bottom-right, margin 0.04 (short side), size **0.30 width** clamped **140–360px**. Overlay: rounded dark chip, logo-above + text-below, padding 0.14, logo-width 0.7.
- Why it dominates: 1200px image → 360px chip ≈ 30% width × ~250–300px height; opacity 0.55 near-opaque on white product shots; vertical lockup maximizes area; thumbnails inherit the full mark then shrink to 640px (mark covers listing cards); margin 0.04 pushes the sticker into the corner; placeholder SVG renders as a flat color block at these sizes.
- Image path: proportional-with-clamps (correct intent, wrong constants). Video path: **effectively fixed-pixel** — `scale` uses the overlay's own width (720) so every video gets ~216px regardless of resolution; `min/maxPx` ignored; small videos oversized, 4K undersized.
- Redesign (no hard-coded pixels): lower `SIZE_RATIO` → ~0.15–0.18, `MAX` → ~220–240px, `MIN` → ~96–120px, opacity → ~0.32–0.40, switch lockup to horizontal (logo-inline + text) or text-only under a size threshold, margin → ~0.05–0.06; thumbnails: separate `WATERMARK_THUMBNAIL_*` policy (smaller ratio or unmarked thumbnails served from marked originals — decision needed); video: scale from `main_w*sizeRatio` with same clamps; share one `WatermarkSpec` (ratio/opacity/position/margin/lockup) consumed by both renderers with per-medium clamps. Verify on white-background electronics shots + 360px cards before locking constants.

## Navigation UX Audit

- Desktop header (`site-header.tsx`): logo + **7 category pills with counts** + search + 2 icons in `h-16` — overcrowded at `lg` (overflow/clip, no scroll/more-menu), truncation inconsistent with home (10) and footer (5). Children never rendered despite `children` in the API type — deep catalog undiscoverable.
- Search: desktop-only, icon-only non-button, no suggestions/scope, stale `useState` on nav, submit **discards** category/brand/sort. Mobile search buried in drawer (extra tap).
- Mobile drawer (`mobile-menu.tsx`): missing width class (collapses to content width), not a dialog (no `role/aria-modal`/focus-trap/Escape/scroll-lock), overlay is a full-screen `<button>` (keyboard trap hazard).
- Account/cart icons `p-2` (~32px < 44px minimum); cart badge **hardcodes `۰`** (reads as broken, not placeholder); no announcement bar; no skip link.
- Core question — can a new customer grasp the store in 10 seconds? **No.** Hero is text-only, categories are count-pills without imagery/children, search is hidden on mobile, and the deepest catalog (storage → flash/SSD/HDD) is flat-listed.

## Category UX Audit

- No `/categories` index; three inconsistent truncations (7/10/5) with no "view all"; no nested nav, mega-menu, child/sibling switcher, descriptions, or imagery; `publishedProductCount` (direct-only) misleads on parents.
- Recommendation (data-driven): 60 paths under one root with 2–3 dominant subtrees (phone accessories 335, computer 288, storage 204, stock 160) → **hybrid**: (a) header mega-menu with the ~6 top subtrees + children on hover/focus (desktop) and accordion in drawer (mobile); (b) a `/categories` index with visual tiles for top-level + counts (roll-up counts, not direct-only); (c) category landing with child-strip + sibling nav + description. Flat grid alone is the wrong pattern at this breadth; full mega-menu-everything is overkill — the 60-path tree fits a compact two-level menu.

## Home Page UX Audit

- Text-only hero (H1 + paragraph + 2 buttons; secondary CTA bound to unstable `categories[0]`), no imagery/promo rail/trust signals/B2B entry; featured categories are text cards (`slice(0,10)`); latest-8 grid only; empty state is one sentence; counts use ad-hoc `Intl` instead of shared formatter.
- Needs: real hero with merchandised categories/products, trust strip (warranty/authenticity/shipping — data exists: `garrantie`/`send_by`/`stock_name`), stable curated CTAs, category tiles with imagery, in-stock/featured rails, proper empty state.

## Product Listing UX Audit

- **P0 bug**: `filters-panel` + `sort-select` hardcode `router.push('/products?...')` — using them on `/categories/[slug]` **abandons the category**. Pagination preserves context; filters don't.
- No breadcrumbs on listing/category; no clear-all; active brand/condition/q have no pills; facets truncated (`slice(0,8)`, brands capped at 50) with no show-more; no price-range, no in-stock toggle, no per-page; 2-col grid cramped at 360px; empty states offer no one-click reset; `limit:24` hard-coded with full-page reloads (no scroll restoration).
- Cards: always `از …` ("from") even for single-variant (misleading); out-of-stock is visual-only (no accessible label); condition pills undocumented (`sand/sabz/red` mix).

## Product Detail UX Audit

- Variants are a static `<dl>` — not selectable, no SKU display, no per-variant stock state. Single-variant shows price only. No CTA (only "buy soon" banner), no quantity/notify/B2B hint beyond footnote — a dead end for purchase intent.
- No related products (terminal page; cross-sell data exists in Woo for later). Specs: only warranty/origin/weight rendered; **dimensions never rendered** despite existing fields; heading mixes specs with description. Brand link uses `?q=<name>` instead of `?brand=<slug>` (breaks FA/multi-word brands). Breadcrumb uses `/` separators, no `<ol>`/`aria-current`. No JSON-LD, no OG images, no canonical.

## Responsive UX Audit

- Shell spacing consistent (`max-w-7xl`, logical properties good). Real issues: filter sidebar stacks above results on mobile (no drawer/collapse — users scroll past filters to see products); drawer width bug; touch targets fail 44px (header icons, pagination ~36px, condition radios 16px, text-only filter buttons); hero CTAs don't wrap at 360px; pagination can overflow; detail price box not sticky; no list/compact view for dense 1000+ catalogs.

## Accessibility Audit

- Positives: `lang=fa dir=rtl`, `role=search`, labelled navs, `aria-current` on pagination, `sr-only` labels, `aria-busy` on filters, `rel=prev/next`.
- Gaps (fix with nav/media work): no skip link (no `#main` target); drawer not a dialog (no modal semantics/focus-trap/Escape); breadcrumb not `<ol>`; gallery has no carousel semantics, thumbs lack `aria-pressed`, alt repeats name ("image 2 of 5" missing), video no poster/captions; cards lack machine-readable price + accessible stock label; filter result-count changes have no live region; no `focus-visible` rings (keyboard focus invisible); `text-gray-400/500` + `sabz-300` contrast risks unverified; `hover:scale-105` ignores `prefers-reduced-motion`; 404 number not a heading.

## Performance Audit

- Scale jump: 23 demo products → ~1093 sellables + ~4117 images. Risks: (a) all pages `force-dynamic`, zero cache (`fetchCategoryTree` runs on every request incl. layout); (b) `price_asc/desc` sorts **in memory over full candidate sets**; (c) exact-slug category match forces over-fetching for parents; (d) 24 eager cards/page, no blur placeholders (LCP pop-in), rich-text `<img>` bypasses optimizer; (e) Vazirmatn variable font downloaded but never applied (wasted bytes + wrong type); (f) no `loading.tsx`/`error.tsx` (API blip = full 500 on listing).
- PostgreSQL suffices — no Elasticsearch/OpenSearch. Add trigram/`unaccent`-style normalization + targeted indexes (see Search). Media: keep local disk for M2-import; CDN deferred.

## Search Audit

- Contract: `q` over **product names only** (64ch). Reality needed: FA + EN names, SKU, brand, category, partial matching, ZWNJ/`ي-ی`/`ك-ک` normalization. Detail brand-pill currently searches `q=<FA name>` — near-guaranteed misses.
- Recommend Postgres-only: `pg_trgm` + normalized search vector (`name`, `nameEn`, `sku`, brand, category, tags) with a `tsvector`/trigram index, server-side normalization helper shared with client (ZWNJ, Arabic-letter folding), SKU-exact boost, pagination preserved. No new infrastructure.

## Data Import Architecture

- Shape: **repeatable idempotent importer**, not a one-shot script. Components: (1) `ImportRun` + `ImportRecord` tables (run id, source row hash, status `PENDING/IMPORTED/UPDATED/SKIPPED/FAILED`, error, timings); (2) resolvers (category-by-path, brand, attribute/spec parsers, SKU dedupe); (3) media downloader (queue, concurrency 4–8, retries, hash dedup); (4) product writer (upsert by `(sourceSystem, sourceId)`, TX per product, ledger receipts); (5) reporter (counts per the required matrix + per-row errors); dry-run (parse + resolve + report, no writes); resume (re-run skips `IMPORTED` with unchanged hash).
- Source identity: `sourceSystem='WOOCOMMERCE'`, `sourceId=<شناسه>`, `sourceType=<نوع>` on Product + Variant; `UNIQUE(sourceSystem, sourceId)`; keep `sourceMeta` narrow (wholesale + fulfilment originals + unparseable spec lines) for audit.
- Error isolation: per-row try/catch → `FAILED` + continue; per-image try/catch → product imports without the failed image + `images_failed++`; never abort run on single failure; exit code non-zero iff failures > threshold.
- Mapping doc: field table (this report's mapping table is the draft) committed as `docs/04-database/woo-import-mapping.md` + per-run report artifact.

## Demo Seed Strategy

- Keep the 23-product seed as **dev fixtures** (fast boot, tests, offline UI work) but separate it from production import: move to `seed-demo` (dev-only, tiny, committed) vs `import:woo` (real catalog, uncommitted data, staging + media outside Git). Woo import must **replace-or-coexist via flag** (`--replace-demo` or separate DB), never merge silently (slug/SKU collisions with demo rows).
- Real catalog (CSV + 4k images) lives **outside Git** (documented fetch location + checksum); only mapping/fixtures/samples committed. Acceptance: fresh env → migrate → `seed-demo` → `import:woo --dry-run` → `import:woo` → media backfill → storefront.

## P0 Findings — Must fix before real catalog import

1. **P0-1 No source identity** — no `sourceSystem/sourceId`; re-imports duplicate everything. (DB: Product+Variant columns + unique.)
2. **P0-2 No attribute/spec model** — 900+ rows of specs + the only variant axis (`انتخاب رنگ`) have nowhere to go. (DB: Attribute/Value + product/variant assignments; parser for `custom_attributes`.)
3. **P0-3 No sale-price field** — `compareAtPrice` missing; promos unrepresentable. (DB: Variant column.)
4. **P0-4 No price-absent state** — 818 published price-less rows; domain + import policy + UI ("call for price" vs hide) undecided. (DB flag or status; user decision required.)
5. **P0-5 Media not bulk-importable** — no downloader, no `contentHash/sourceUrl`, no queue/retries/reporting; re-runs duplicate. (DB columns + importer service.)
6. **P0-6 Slug strategy breaks on Persian** — `generateSlug` strips FA names to UUID fallbacks (collision-prone, unreviewable at 1000+ rows); no transliteration. (Importer slugger + uniqueness + report.)
7. **P0-7 Category semantics wrong for import** — exact-slug match (no subtree) + direct-only counts will misfile/misrepresent the 60-path tree. (API: subtree inclusion + roll-up counts.)
8. **P0-8 Import-or-skip policy undefined** — drafts (26 rows), unbranded (924), imageless (10), priceless (818), `دسته بندی نشده`, wholesale-only rows. Dry-run + report + decisions needed before writes.

## P1 Findings — Must fix before production storefront

9. **P1-1 Category-context bug** (filters/sort abandon `/categories/[slug]`), no breadcrumbs/clear-all on listing.
10. **P1-2 Flat, truncated nav** (7/10/5 slices, children never rendered) — mega-menu/accordion + `/categories` index + consistent counts.
11. **P1-3 Search insufficient** — name-only; needs SKU/EN/brand/category + FA normalization (Postgres trigram, no new infra).
12. **P1-4 Variants not selectable; no SKU display; `از` mislabel; brand link uses `q=`; no related products; no JSON-LD/OG/canonical.**
13. **P1-5 Watermark too large + video path fixed-pixel** — proportional redesign + thumbnail policy.
14. **P1-6 Logo not a centralized asset** — brand module + `public/brand/` + API `assets/brand/`; real vector master still owed by user.
15. **P1-7 Vazirmatn imported but unapplied** — wire `--font-sans`, remove fallback risk; fix physical-property leaks (`figure` margins), `←` direction, `/` breadcrumb separators.
16. **P1-8 Perf: cache + loading/error states** — `revalidate`/tags, `loading.tsx`/`error.tsx`, kill in-memory price sort (denormalized `minPrice`), blur placeholders.
17. **P1-9 Tags + SEO fields missing** — Tag model + metaTitle/metaDescription/focusKeyword (+ `nameEn`, `subtitle`, `Brand.nameEn`).
18. **P1-10 A11y gaps in new nav/media** — dialog semantics, focus-trap/Escape, live regions, focus rings, gallery semantics, contrast audit, reduced-motion.

## P2 Findings — Valuable improvements

- Secondary-category join (multi-cat fidelity); warranty normalization dictionary; fulfilment trust-signal component from seller/stock/send_by; dimension rendering; price-range + in-stock facets; per-page control; compact list view; promo/featured rails; curated hero; footer real content (address/phone/hours/social); announcement bar; video posters; `Brand.logoKey` activation; stale-doc cleanup (S3/BullMQ/shadcn/Nginx, Holo references, aspirational API §§6–12).

## P3 Findings — Future work (explicitly not now)

- Pricing engine / tiers / wholesale storefront; cart/checkout/orders/payments (M3); marketplace sellers; Holo accounting; Torob/SnappPay; mobile apps; Elasticsearch; CDN migration; recommendations/personalization; analytics dashboards.

## Proposed Implementation Roadmap

> Dependency-aware; importer unblocks everything visual (UX needs real data volume to validate against).

- **Phase A — Data/domain readiness (P0 schema)**: source identity, `compareAtPrice`, price-absent state, attribute/spec models, tag+SEO+`nameEn`+`subtitle` fields, media hash columns, slugger, category subtree+counts. No UX yet.
- **Phase B — WooCommerce importer**: staging (`ImportRun/Record`), resolvers, media downloader, writer, dry-run/resume/reporting, mapping doc. Validate on full CSV in staging.
- **Phase C — Brand/logo/media pipeline**: brand asset module, real master ingestion (user-supplied), watermark redesign (image+video+thumbnail policy), thumbnail/video-poster hardening.
- **Phase D — Navigation redesign**: mega-menu/accordion, `/categories` index, breadcrumbs, search prominence (mobile included), drawer dialog fix, skip link.
- **Phase E — Category UX**: landing (child-strip, sibling nav, descriptions), tile system, roll-up counts, facet "show more".
- **Phase F — Listing UX**: context-preserving filters/sort, clear-all + pills, price/in-stock facets, card truth (`از` only for multi), accessible stock, pagination hardening.
- **Phase G — Detail UX**: variant selector + SKU, specs table (dims included), related rail, brand-link fix, JSON-LD/OG/canonical, CTA-ready slots for M3.
- **Phase H — Home UX**: merchandised hero, trust strip, curated rails, real footer content.
- **Phase I — Hardening**: RTL/font/a11y pass, responsive/touch pass, perf (cache, `minPrice`, skeletons, image placeholders), search normalization + indexes.
- **Phase J — Final acceptance**: full-catalog staging import → QA matrix (FA/EN/SKU search, filters, RTL, mobile, a11y, perf) → doc updates → go/no-go for M3.

## GitHub Issue Breakdown

> Small vertical slices. IDs are proposed (`SS-2xx` continuing the tracker). Each issue is implementer-ready.

1. **SS-200 `feat(catalog): WooCommerce source identity + import staging tables`** — Purpose: idempotent imports. Problem: no source columns, no run audit. Changes: `sourceSystem/sourceId/sourceType` + unique on Product/Variant; `ImportRun`/`ImportRecord` models; migration. Files: `apps/api/prisma/schema.prisma`, `modules/products/*`. DB: migration. Testing: unit (uniqueness) + integration (re-upsert no dup). DoD: double-write produces zero new rows. Agent: **OpenCode**. Depends: none.
2. **SS-201 `feat(catalog): compareAtPrice + price-absent state`** — `Variant.compareAtPrice?` + `Product.priceStatus` (or variant-level) + validation (`compareAt > price`); import policy flag; storefront "call for price" vs hide. Files: schema, variant DTOs/service, `packages/types`, card/detail. Agent: OpenCode (+ Spark for price UI). Depends: SS-200.
3. **SS-202 `feat(catalog): attribute + spec domain models`** — `Attribute/AttributeValue/ProductAttributeValue/VariantAttributeValue` (+ `isFilterable`, `source`); admin CRUD minimal; public read shapes. The no-blob decision recorded in ADR. Agent: OpenCode. Depends: SS-200.
4. **SS-203 `feat(catalog): tags, SEO, nameEn, subtitle, Brand.nameEn`** — Tag join + meta fields + `subtitle` + `nameEn`s; migration; public DTO extension. Agent: OpenCode. Depends: SS-200.
5. **SS-204 `feat(media): contentHash + sourceUrl + thumbnail/video policy columns`** — dedup columns + unique `(productId, sourceUrl)`; migration. Agent: OpenCode. Depends: SS-200.
6. **SS-205 `feat(catalog): Persian-safe slugger + subtree category reads + roll-up counts`** — transliteration slugger, subtree `category` filter, recursive counts, report collisions. Files: `slug.ts`, `public-catalog.service.ts`. Agent: OpenCode. Depends: none (parallel with SS-200).
7. **SS-206 `feat(import): WooCommerce CSV parser + resolvers (dry-run)`** — parse 243-col FA CSV, category-by-path/brand/attr/spec/SKU resolvers, dry-run report (imported/updated/skipped/failed matrix), no writes. Files: new `modules/import/` + `docs/04-database/woo-import-mapping.md`. Agent: OpenCode. Depends: SS-200–205.
8. **SS-207 `feat(import): product writer + ledger receipts + resume`** — upsert by source identity, TX per product, `INITIAL_STOCK` receipts, resume/skip-unchanged, per-row errors. Agent: OpenCode. Depends: SS-206.
9. **SS-208 `feat(import): bulk media downloader`** — queue, concurrency cap, retries, MIME/size guards, hash dedup, `isPrimary`/sortOrder from CSV order, per-image report. Agent: OpenCode. Depends: SS-204, SS-207.
10. **SS-209 `feat(brand): centralized brand assets + logo ingestion`** — `public/brand/` kit + `brand.ts` config + header/footer/nav/metadata wiring + favicon/OG; ingest user-supplied vector master (blocked until supplied — placeholder stays). Agent: OpenCode (structure) + **Spark** (header/footer polish). Depends: user delivers master.
11. **SS-210 `fix(media): proportional watermark + video parity + thumbnail policy`** — shared `WatermarkSpec`, retuned ratios/opacity/margins, horizontal lockup, video `main_w`-based scaling, thumbnail policy (smaller/unmarked), white-background verification set. Agent: OpenCode (pipeline) + Spark (visual QA). Depends: SS-209 (master) for final constants; interim values allowed.
12. **SS-211 `feat(storefront): navigation redesign (mega-menu, drawer, search prominence)`** — two-level menu, `/categories` index, mobile accordion, dialog-a11y drawer fix, search on mobile + state preservation, skip link, badge honesty (remove hardcoded ۰). Agent: **Spark** (lead) + OpenCode (API needs). Depends: SS-205.
13. **SS-212 `feat(storefront): category landing + tiles + facets`** — child-strip/sibling nav/descriptions, tile system, show-more facets, consistent counts. Agent: Spark. Depends: SS-211.
14. **SS-213 `feat(storefront): listing truth + filters`** — context-preserving filters/sort, clear-all/pills, price/in-stock facets, `از`-only-multi, accessible stock, empty-state reset. Agent: Spark (+ OpenCode for API facets). Depends: SS-211.
15. **SS-214 `feat(storefront): product detail completion`** — variant selector + SKU copy, full spec table (dims), related rail, brand-link fix, JSON-LD/OG/canonical. Agent: Spark (+ OpenCode for related API). Depends: SS-202 (attrs), SS-213.
16. **SS-215 `feat(storefront): home + footer reality`** — merchandised hero, trust strip (warranty/send data), curated rails, real footer (address/phone/hours/social), announcement bar. Agent: Spark. Depends: SS-211 (needs user-provided company info).
17. **SS-216 `feat(search): Persian Postgres search (trigram + normalization)`** — `pg_trgm`, normalized vector over name/EN/SKU/brand/category/tags, SKU boost, shared normalizer, indexes; no new infra. Agent: OpenCode. Depends: SS-203.
18. **SS-217 `perf(storefront): cache, skeletons, minPrice denormalization`** — revalidate/tags, `loading.tsx`/`error.tsx`, `minPrice` column + writer, blur placeholders, font wiring. Agent: OpenCode + Spark. Depends: SS-211–214.
19. **SS-218 `a11y(storefront): nav/media/listing pass`** — focus rings, live regions, gallery semantics, contrast fixes, reduced-motion, breadcrumb semantics, touch targets ≥44px. Agent: Spark. Depends: SS-211–214.
20. **SS-219 `docs: import runbook + mapping + env + brand`** — fresh-env→import→storefront runbook, committed mapping doc, `.env.example` deltas, brand-kit README, stale-doc cleanup (S3/BullMQ/shadcn/Holo/aspirational API). Agent: OpenCode (or either). Depends: SS-206–208.

## Agent Assignment

- **OpenCode** (primary): SS-200–208 (schema/migrations/importer/media pipeline), SS-216–217 backend parts, SS-219. Rationale: cross-module backend, Prisma, ledger integrity, bulk concurrency.
- **Muse Spark 1.3 Free** (focused): SS-211–215 (nav/category/listing/detail/home UX), SS-218 (a11y), SS-210 visual QA, SS-217 frontend parts, component critiques/reviews. Rationale: isolated UI slices, visual refinement, accessibility — small blast radius.
- Joint: SS-210, SS-217 (pipeline + presentation meet at thumbnails/caching).

## Dependencies

```
SS-200 ─┬─ SS-201 ─┐
        ├─ SS-202 ─┼─ SS-206 ─ SS-207 ─ SS-208
        ├─ SS-203 ─┘       (needs SS-205 slugger)   SS-204 ─┘
SS-205 ─┴─ SS-211 ─ SS-212 ─ SS-213 ─ SS-214 ─ SS-215
SS-209 (user master) ─ SS-210 ─┐
SS-216 (needs SS-203) ─────────┼─ SS-217 ─ SS-218 ─ SS-219 ─ J-gate
```

Critical path: SS-200 → SS-202/205 → SS-206 → SS-207 → SS-208 → staging import → SS-211+ (UX validated against real volume).

## Definition of Done

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green (per AGENTS.md §12/15).
- Fresh Docker Compose boot passes; `seed-demo` idempotent; `import:woo --dry-run` + full import produce the required report matrix with zero duplicates on re-run.
- No TypeScript errors; migrations committed; mapping doc + runbook updated; commit/PR conventions followed (`feat/ss-xxx-…`).
- Manual QA per issue (360px/1440px, RTL, keyboard-only, failed-image/import resilience, FA/EN/SKU search probes).

## Final Acceptance Plan

1. Staging: fresh env → migrate → `seed-demo` → `import:woo` full CSV + media (record report matrix; targets: ~1093 products, ~59 variants linked, 60-path categories, 4117 images with `images_failed` triaged).
2. Re-run import → assert zero new rows/media (idempotency proof).
3. QA matrix: category subtree browsing, variant selection, price/sale/call-for-price states, search probes (Persian with ZWNJ, English name, SKU, brand), filters/sort/pagination at full volume, mobile drawer/nav, gallery/video, breadcrumbs, related rail, a11y keyboard pass, Lighthouse/perf sanity, watermark subtlety review on white shots + cards.
4. Docs + decision log (ignored-field list, price-absent policy, unbranded-brand policy, `دسته بندی نشده` exclusion) signed off → M3 (cart/checkout/orders) unblocked.

## Open Questions / Required User Decisions

1. **Price-absent products (818 rows)**: import as visible "call for price", hidden draft, or skip? (Recommendation: visible non-purchasable with call-for-price UI — electronics B2B expects it.)
2. **Unbranded products (924)**: nullable brand vs synthetic "متفرقه/Generic" brand?
3. **Drafts/private (26 rows)**: import as DRAFT or skip?
4. **`دسته بندی نشده`**: confirm exclusion.
5. **Multi-category**: accept single-primary loss for M2 (secondary join P1) or require join now?
6. **Thumbnail watermark**: smaller mark vs unmarked thumbnails?
7. **Logo master**: supply SVG + wordmark + light/dark/mono variants + favicon/OG approval; plus company footer facts (address, phone, hours, socials) for SS-215.
8. **Wholesale columns**: preserve-only (recommended) vs minimal B2B display in M2?
9. **Import host**: run bulk download from staging host (bandwidth/time for ~4k images) — acceptable? Concurrency/retry defaults OK (4–8 workers, 3 retries)?
10. **Demo seed**: keep 23-product fixtures alongside (flag-gated) or remove post-import?

---

*Method note: CSV profiled directly (1152 rows; `wc -l` 6369 counts embedded newlines in HTML descriptions). Schema/modules/storefront findings via full file reads + 4 parallel research agents. `company-logo.png` and the CSV are untracked at repo root — commit or `.gitignore` disposition needed (CSV + fetched images must stay out of Git; logo master belongs in `public/brand/` + `assets/brand/` once supplied).*
