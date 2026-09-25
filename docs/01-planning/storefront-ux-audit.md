# Storefront UX Audit — Real Catalog (1,095 products)

> Investigation and planning only. Baseline: commit `43b6e15` (SS-211…SS-219 merged).
> Findings verified by direct code reads, a live walkthrough of `localhost:3002`
> (desktop 1440 + mobile 390), and catalog profiling through the public API.
> Companion planning document: `storefront-master-plan.md`.

## A. Current baseline

- HEAD `43b6e15` on `master`. All of SS-211…SS-219 merged (PRs #205–#213): nav redesign, category landing, listing truth/filters, detail completion, home/footer, Persian search, caching, a11y, import runbook.
- Stack live: API :3000, storefront :3002, Postgres/Redis in Docker.

## B. Real catalog profile (queried live from `/api/v1/catalog`)

| Metric | Value |
|---|---|
| Published products | **1,095** |
| Call-for-price | **855 (78.1%)** — priced: 240 |
| In stock | 312 (28.5%) |
| Unbranded | 605 (55.3%) |
| Categories | 2 roots («کالای دیجیتال» 1,086 / «ابزار» 9), 59 nodes, depth ≤4 (12 d2 / 37 d3 / 8 d4) |
| Largest leaves | لپ تاپ استوک 103, هدفون 99, پاوربانک 99, فلش مموری 88, اسپیکر 77, هارد اکسترنال 61, SSD 49 |
| Brands | 44 entities; **EN/FA duplicates as separate brands**: وریتی/Verity، گرین لاین/Green Lion، اوریکو/orico، ای دیتا/adata |
| Variants | 1,080×1 variant, 15×2–4 |
| Condition | 1,094 NEW, 1 STOCK_CLEARANCE → facet dead weight |
| Prices | min 2,050,000 / median 45,000,000 / max 5,890,000,000 — **stored Rial verbatim (SS-207 O-1) while the UI labels تومان → 10× display error** |
| Name length | median 42, p95 74, max 110 chars |
| Media | 1 imageless product; **107 missing thumbnails** (cards fall back to originals) |
| On-sale | 12 rows with compareAtPrice |

## C. Current storefront walkthrough

- **Home**: text-only hero; category section renders **2 text tiles**; in-stock/latest rails = import-order artifacts (wall of `proone`); announcement/trust hidden; footer has links only — no phone/address/hours anywhere.
- **Header/nav**: 2 nav items; mega-menu works (11 children + grandchildren + counts) but the whole store hides behind one root. Mobile search row prominent; drawer + accordion work.
- **Listing**: clean grid, result status, active pills, clear-all, pagination, per-page — good. Default sort «جدیدترین» = import order; **category facet shows only the 2 roots**; brand facet has no counts and shows EN/FA duplicates; condition facet = 5 radios for 1 real value; price facet labeled «تومان» queries Rial data (10× off).
- **Category landing** (computer-accessories, 380): breadcrumb, roll-up count, child grid with counts, sibling strip — best-built screen.
- **Cards**: good structure; «بدون برند» printed literally on 55% of cards; watermark subtle on thumbnails.
- **Detail**: good structure (breadcrumb, gallery, purchase panel, SKU, specs table, related rail, JSON-LD). Problems: literal `\n` artifacts in short/description; machine-generated SEO filler from the old site; **huge watermark on original-size images**; nameEn/subtitle often duplicated; call-for-price says «تماس بگیرید» with **no contact info anywhere** — a dead end for 78% of the catalog.
- **Search (SS-216)**: works, context-preserving on category routes, good empty state; SKU query «PMG55» → 6 sensible results.
- **Mobile (390×844)**: **fatal flaw — the filters panel renders inline above the grid: 1,333px tall; first product card at 1,662px ≈ two screens of scrolling before any product.**
- **Empty/error**: pills + clear-all + helpful copy; skeletons present (SS-217).

## D. Customer journeys

- **Exact product** (search → detail): works; friction = broken text, 10× price, dead-end CTA.
- **Category browse**: discovery weak (2 tiles); sidebar category facet useless above root level.
- **Browse laptops**: wall of identical «بدون برند»/«تماس بگیرید» cards with no distinguishing spec line (subtitle data exists but not on cards).
- **Price/availability check**: cannot be answered correctly (10× prices; 72% ناموجود; 78% no price; no contact channel).
- **Mobile known-item**: search reachable; any filter use pushes products 2 screens down.
- **No idea what category**: `/categories` shows 2 tiles → dead end; mega-menu rescues desktop only.

## E. Data-quality findings (separate from UI)

1. Price unit: DB Rial vs UI/contract Toman (`apps/api/src/modules/import/woo-write.ts` O-1 verbatim vs `milestone-2-plan.md` Decision 1).
2. Brand alias duplication (4+ pairs) — needs O-2 merge pass.
3. Import text corruption: literal `\n` sequences in shortDescription/description.
4. Machine-generated SEO filler descriptions (content rewrite = business task).
5. `subtitle` duplicates `nameEn` on many products.
6. «ابزار» stray second root (9 products; O-3 merge candidates never applied).
7. `createdAt` = import time → «جدیدترین» meaningless; Woo post dates exist in the CSV.
8. 107 missing thumbnails; spec labels untranslated EN keys (CPU/RAM/…).

## F. Strengths to keep

URL-as-state listing architecture (`apps/storefront/src/lib/listing.ts`), category landing composition, result-status/pills/empty-state system, Persian search + normalizer, Data Cache + tags + skeletons, a11y pass (skip link, status regions, 44px targets, dialog drawer), variant selector, honest placeholder policy.

## G. UX problems & evidence

1. **P0 Price trust**: every priced product shows 10× (PMG55 mouse: «۱۶٬۰۰۰٬۰۰۰ تومان»). Certain.
2. **P0 No conversion path**: call-for-price/out-of-stock instruct «تماس بگیرید» with zero contact info site-wide. Affects 78% of catalog. Certain.
3. **P1 Mobile filters block**: 1,333px aside above grid. Certain.
4. **P1 Category IA collapse**: `navRoots()` (`apps/storefront/src/lib/nav.ts`) unwraps a *sole* root but the stray «ابزار» root defeats it → 2-item nav, 2-tile home//categories, 2-root facet. High.
5. **P2 Listing scannability**: no brand counts, no per-card spec line, «بدون برند» noise, meaningless «جدیدترین», dead condition facet.
6. **P2 Detail credibility**: `\n` artifacts, filler copy, oversized watermark on originals, duplicated nameEn/subtitle.

## H. IA alternatives considered

- A. Keep current IA + targeted fixes — leaves nav/facets useless at scale.
- B. Re-root browsing at the real trunk (11 children of «کالای دیجیتال» become effective roots; merge «ابزار»).
- C. Search-first — rejected: 55% unbranded, noisy titles, fragmented brands.
- **D. Hybrid (B + current search) — recommended.**

## I. Resolution notes

- Price unit: **display-side ÷10** (user decision, 2026-09-25): DB stays Rial; a single storefront conversion helper divides at presentation and multiplies price-facet bounds at the API boundary. Contract docs must be amended to codify "DB stores Rial; UI presents Toman"; admin remains Rial (ops note).
- Contact facts recovered from sabzsistem.com/contact-us: phones ۰۲۱-۹۱۳۰۱۹۰۰ / ۰۱۱-۳۳۳۴۱۶۸۴، WhatsApp ۰۹۳۶۱۶۶۲۶۴۶، ساری بلوار پاسداران، hours شنبه–چهارشنبه ۹–۱۸:۳۰ / پنجشنبه ۹–۱۳:۳۰، info@sabzsistem.com، Enamad/Torob seals, Telegram/Bale consultation links.
