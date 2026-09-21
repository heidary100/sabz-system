# WooCommerce → Sabz Import Mapping (SS-206)

Source dataset: `wc-product-export-20-9-2026-*.csv` (14 MB, Persian-language
WooCommerce export, **1152 rows × 243 columns**). The file lives outside Git;
fetch location + checksum are recorded with the release process (SS-219
runbook). The executable source of truth for column dispositions is
`apps/api/src/modules/import/woo-columns.ts` — this document explains the
reasoning; the code enforces it (a spec asserts zero unmapped headers).

Dry-run entry: `pnpm --filter @sabz/api woo:dry-run -- --file <csv> [--out <report.json>] [--limit N]`.
Writes nothing, ever. Reference data (categories, brands, slugs, SKUs, source
keys) is read from `DATABASE_URL`.

## 1. Dataset profile (dry-run verified)

| Dimension | Value |
|---|---|
| Rows | 1152 (1069 simple, 24 variable, 59 variation) |
| Published / draft / private | 1126 / 14 / 12 |
| Proposed actions (empty catalog) | CREATE 1125, SKIP 27, UPDATE 0 |
| Price states | PRICED ~240, CALL_FOR_PRICE 852 (of which wholesale-only 143), NA (shells) |
| On sale / sale windows / featured | 12 / 29 (window 2026-09-05→21) / 9 |
| Orphan variations | 11 (4 unnamed, 7 unresolvable مادر) |
| No-category rows / uncategorized bucket | 10 / 6 (all SKIP, review list in report) |
| Unbranded (product-level) | 624 |
| Imageless products | 10 |
| Image refs / distinct URLs | 5174 / 4488 (single domain) |
| Tag assignments / distinct tags | ~2500 / 1079 |
| custom_attributes lines | ~2700: ~1100 specs, ~1570 bullets, 7 true dirt |
| Slug collisions (vs demo seed + in-file) | 31 suffixed, reported per row |
| SKU collisions | 0 |

## 2. Structural traps (read before touching the importer)

1. **Ragged rows.** Body rows carry 132–243 cells (trailing empties omitted).
   `columns: true` CSV parsing silently inherits the first row's short width;
   the parser zips a separately parsed header instead. No body row exceeds
   243 cells (verified).
2. **مادر holds the parent SKU, not its name.** Variation→parent linkage
   resolves `مادر` against in-file `شناسه محصول` values first, then catalog
   variant SKUs. Four variations have empty مادر; seven more point nowhere.
3. **`_`-prefixed metas are ACF field keys** (`field_5d7…`), not data. The
   display twins (`garrantie`, `send_by`, …) carry the values. Never map an
   underscore twin.
4. **Ancestor-chain redundancy.** `دسته‌ها` lists every level
   comma-separated; the importer resolves the deepest chain only.
5. **Currency decided (SS-207, O-1).** CSV prices are Rial and are written
   verbatim (no conversion). The dry-run reports raw values only.
6. **`_rank_math_gtin_code` is untrusted.** 451 rows hold model codes/titles
   (`HD720`), not GTINs. Never barcode. Only the single-row `GTIN…` column
   maps to `Variant.barcode`.
7. **Sale window is live.** 29 rows carry 2026-09-05→21; `compareAt` imports
   as evergreen until sale scheduling exists (deferred).

## 3. Column dispositions

Summary over 243 headers: **mapped 125, deferred 43, ignored 75**, zero
fallback (spec-enforced on a committed full-header fixture).

### 3.1 Mapped — identity, lifecycle, content

| WooCommerce | Sabz target | Notes |
|---|---|---|
| شناسه | `(WOOCOMMERCE, شناسه)` identity | Stable across re-imports; never slug/SKU. |
| نوع | sourceType + routing | simple→1-variant product; variable→shell; variation→variant. Unknown → SKIP. |
| شناسه محصول | Variant.sku | Deduped with report; variable shells carry codes too (linkage). |
| GTIN… | Variant.barcode | One populated row. |
| نام | Product.name | Slug transliterated (SS-205); empty → SKIP. |
| منتشر شده | Product.status | 1→PUBLISHED (if resolvable), else DRAFT. |
| قابل مشاهده در کاتالوگ | visibility gate | All rows `visible`; anything else → SKIP (loud). |
| توضیح کوتاه / توضیحات | shortDescription / description | Sanitized HTML; multiline cells preserved; inline `<img>` takes the description-image path. |
| قیمت عادی | Variant.price | Missing/zero on published rows → CALL_FOR_PRICE (Q1). |
| قیمت فروش ویژه | Variant.compareAtPrice | 12 rows; sale-without-regular drops compareAt + flags. |
| در انبار؟ / انبار | ledger receipt | One `INITIAL_STOCK` per variant on DEFAULT (SS-207). |
| وزن (گرم) / درازا / پهنا / بلندا | weightKg / depthCm / widthCm / heightCm | Zero rows populated; grams÷1000; mapping ready. |
| دسته‌ها | Product.categoryId | Deepest chain; 58 empty + 6 bucket → SKIP + review list. |
| برچسب‌ها | Tag/ProductTag | ZWNJ-normalized (SS-203); order preserved. |
| تصاویر | ProductMedia | Order→sortOrder, first→primary; single-domain URLs. |
| مادر | Variant.productId | Via parent SKU (trap 2). |
| برندها | Brand | Column wins over `برند` attribute; absent → nullable (Q2). |
| `نام/مقدار/نمایان/سراسری/پیشفرض N صفت` (N≤22) | Attribute pipeline | `انتخاب رنگ` → variant axis; rest → specs; dotted names → groups; `پیشفرض` → default marker. |
| product_english_name | Product.nameEn | 799 rows. |
| custom_attributes (parsed) | ProductSpec WOO_CUSTOM | ~1100 key: value lines (SS-202 contract). |
| custom_attributes (bullets) | preserved raw | ~1570 keyless feature lines; display-list candidate, no field yet. |
| garrantie | Product.warranty | 711 free-text lines. |
| seller_brand / stock_name / send_by | sourceMeta trust signals | Near-constant; one fulfilment component, not columns. |
| newkala_subtitle_product | Product.subtitle | 948 rows. |
| second_image | gallery position 1 | Convention, no new field. |
| rank_math_title/description/focus_keyword, yoast metadesc | metaTitle/metaDescription/focusKeyword | RankMath wins on conflict; keyword index-only. |

### 3.2 Deferred — preserved raw in ImportRecord.sourceData

B2B pricing (`wholesale_customer_wholesale_price` 138, `قیمت همکار` 6,
`Wholesale Prices`, `ced_cwsm_wholesale_price`, festi/have/variations flags);
analytics (`count_recommended`, `post-views`, `osa_app_report_postviews`,
`timestamp_add_offer`); promos (`special_offers` 366,
`inslider_special_offers` 278, `special_offer_short_title` 3,
`off_product_cat` 23 serialized Arrays, `how_apply_product_rule` 29);
relations (upsells 5, cross-sells 3 with `id:NNNNN` refs); featured
(`آیا ویژه است؟` 9, `_woodmart_new_label` 1 — no `isFeatured` yet);
sale windows (start/end dates); video refs (4 rows); content fragments
(`content_slider`, `des_before_price` 2, `_subtitle` 1); unreliable GTIN
field; empty price-history series.

### 3.3 Ignored — documented, no data lost (snapshot keeps everything)

ACF `field_…` keys; RankMath/Yoast scores, social overlays, internal,
permalink, pillar, video/analytics states; primary-term pointers (taxonomy
resolves from native columns); Elementor/Theme/WP housekeeping
(`_wp_page_template`, `_elementor_*`, woodmart, `_wp_old_date`,
`_wp_desired_post_slug`); notification flags; addon/review constants
(reviews off export-wide); `festi*` empty states (`[]`/`0`); tax constants;
download limits (empty); `یادداشت خرید`/external URL/button (empty);
grouped products (empty); `موقعیت` 0/1 (no ordering signal — first-seen
order used); `display_warning_text: off` (warnings disabled); empty
`_product_rules`.

## 4. Policy sign-off (Q1 decided, Q2–Q5 + OPENs for approval)

| # | Policy | Status |
|---|---|---|
| Q1 | Priceless published rows → visible CALL_FOR_PRICE | Decided |
| Q2 | Unbranded rows → nullable brand, no synthetic brand | **Decided (SS-207)** — `Product.brandId` nullable via `ss_207_nullable_brand` |
| Q3 | Non-published rows → DRAFT | **Decided (SS-207)** |
| Q4 | No-category (10) + bucket (6) rows → SKIP + review list | **Decided (SS-207)** |
| Q5 | Single primary category for M2 | **Decided (SS-207)** |
| O-1 | Rial/Toman rule for CSV prices | **Decided (SS-207): Rial verbatim, no conversion** |
| O-2 | Brand alias reconciliation (adata/ای دیتا, orico/اوریکو…; 33 candidates) | OPEN |
| O-3 | Category merge review (ابزار/ابزار آلات/ابزارآلات, لپ‌تاپ variants…) | OPEN |

## 5. SS-207 writer handoff

- Two-pass in-file linking (parents before variations by SKU index) is
  primary; fallback for new-variation/known-parent across runs resolves the
  مادر SKU against catalog variant SKUs (SS-207; a full
  `ImportRecord.sourceData` scan remains deferred).
- Upsert by `(sourceSystem, sourceId)`; TX per product; ledger receipts per
  variant; resume on `ImportRecord` statuses; per-row isolation with the
  report matrix as acceptance.
- Slug freeze: never rename stored slugs; `ensureUniqueSlug` + collision
  report.
- Brand alias + category merge passes precede the first full write.
- Currency rule (O-1): Rial verbatim — locked in SS-207.
