# Milestone 2 — Storefront Catalog Experience

Planning & architecture document. Prepared 2026-09-19.

Status: **Approved for execution** — all open questions resolved 2026-09-20
(see "Decisions" at the end of this document; those decisions are binding for
the issues below).

Implementation agents: OpenCode / Muse Spark 1.3 Free, one issue at a time, per
`docs/07-development/ai-development-workflow.md` and `AGENTS.md`.

---

## Executive Summary

The originally proposed Milestone 2 theme — *"Product Catalog, Categories, Media &
Inventory"* — is **already implemented**. Repository evidence:

- Categories, brands, products, variants, media (with server-side watermarking
  via FFmpeg), description images, warehouses, inventory items, movements and
  reservations all exist as NestJS modules under `apps/api/src/modules/products`
  and `apps/api/src/modules/inventory`, backed by migrations
  `20260819190127_ss_100_product_catalog_foundation` and
  `20260820120000_ss_109_inventory_foundation` and refined by SS-110–SS-118.
- The admin CMS fully operates all of it: category tree with drag-and-drop
  reorder (`apps/admin/src/pages/categories-page.tsx`), full product editor with
  variants and media upload (`apps/admin/src/components/products/product-editor.tsx`),
  TipTap 3 rich-text authoring with image upload/crop/import
  (`apps/admin/src/components/products/content-editor/`), inventory
  receive/adjust/reserve UI, and warehouse management.
- `docs/01-planning/milestones.md` places "Product Management (categories,
  brands, CRUD, media, watermarking)" and "Inventory" in **Milestone 1**, and
  the highest referenced issue ID in the repository is **SS-118**
  (`docs/07-development/development-guide.md:671`).

The genuine Milestone 2 gap is the **customer-facing storefront**:
`apps/storefront` contains a static home page and a placeholder
`/products` page that literally says "The product catalog is not available yet."
(`apps/storefront/src/app/products/page.tsx:12`). The API spec explicitly
deferred the public side twice: *"Deferred: product media/storage (SS-105),
storefront/public product APIs"* (`docs/05-api/api-specification.md:915`) and
*"Public/storefront catalog media delivery is out of scope for this milestone"*
(`docs/05-api/api-specification.md`, media section).

**This milestone therefore delivers the customer-facing catalog end-to-end:**

1. A **public, read-only catalog API** (`/catalog/*`) exposing published
   products, categories, brands, and availability — reusing the existing
   modules, conventions, and soft-delete/lifecycle rules.
2. A **public product-media serving endpoint** — the one genuinely new
   infrastructure piece — streaming the already-watermarked assets with
   immutable cache headers, following the proven `description-images` pattern.
3. The **storefront experience**: RTL/Persian layout shell, category
   navigation, product listing with filters/sort/pagination, product detail
   (gallery, video, rich text, availability), and a real home page.

Cart, checkout, orders, payments, and partner tier pricing on the storefront
are **explicitly out of scope** (see Scope and Decisions).

The milestone requires **zero or near-zero schema changes**, leaves every
existing admin workflow untouched, and keeps the Docker Compose reproducibility
contract intact.

---

## Current Repository State

### Status matrix

| Area | Status | Evidence | Problems | Milestone action |
| --- | --- | --- | --- | --- |
| Auth / users / roles | Complete | `apps/api/src/modules/auth`, `users`; OTP + JWT access + refresh cookie (`auth/refresh-token-cookie.ts`), `roles.guard.ts`; admin UI login/user/role pages | None blocking | None (consume as-is) |
| Partners + documents | Complete | `apps/api/src/modules/partners` (approval workflow, SS-038 document storage on local driver) | Object-storage driver deferred (by design, SS-038) | None |
| Categories | Complete | `products/categories.controller.ts` (`admin/categories` incl. `/tree`, `/reorder`), schema `Category` (adjacency tree, `sortOrder`, `isVisible`, soft delete) | No max-depth cap (acceptable; UI controls depth) | **Expose publicly** (SS-120) |
| Brands | Complete | `products/brands.controller.ts`, schema `Brand` | — | **Expose publicly** (SS-120) |
| Products + variants | Complete | `products/products.controller.ts`, `variants.controller.ts`; lifecycle DRAFT→PUBLISHED→ARCHIVED; `ProductVariant.sku` unique, `price Decimal(12,2)` | Legacy `ProductVariant.stockQuantity` still exists (deprecated by SS-113, not removed) | **Expose publicly** (SS-121/122); do not read `stockQuantity` |
| Product media + watermarking | Complete (admin-side) | `products/media-processing/*` (image processor, FFmpeg video processor, watermark overlay/config); stored binaries are the **watermarked** assets (`docs/06-uml/domain-model.md:182`); `media.controller.ts` serves binaries only via authenticated admin endpoints | **No public media serving** — explicitly deferred in M1 | **Public serving endpoint** (SS-123) — the key new piece |
| Description images | Complete | Public immutable endpoint `GET /description-images/:file` (`description-images.controller.ts:152-185`); server-side HTML sanitization (`products/description-sanitize.ts`) | — | None (storefront renders descriptions as-is) |
| Rich text editor | Complete (admin) | TipTap 3 + custom `ProductImage` node, HTML in `product.description`, allowlist-sanitized (`apps/admin/src/components/products/content-editor/`) | None | Storefront rendering component **already exists** (`apps/storefront/src/components/rich-text.tsx`) |
| Inventory | Complete (admin-side) | `inventory` module: warehouses, receive/adjust/reserve/release/consume, movements ledger with before/after, reservations; aggregate helper exposed by SS-112 | "Storefront availability" named as future work (`docs/05-api/api-specification.md:1328,1414`) | **Availability read for catalog** (SS-121/122) |
| Pricing | Partial | `ProductVariant.price` (base retail); `PartnerTier.discountPercent` exists but is referenced nowhere in products/inventory code (grep evidence) | Tier pricing engine not implemented (spec `pricing-engine.md`: M1 core / M2 advanced) | Retail display only (SS-121/122); tier display deferred (Decision 2) |
| Admin frontend | Complete | 20+ pages, uniform hook/service patterns, RTL Persian Catalyst UI (see Existing Architecture) | Only 2 unit tests, no component tests (pre-existing) | None |
| Storefront | **Prototype** | `app/page.tsx` (static hero), `app/products/page.tsx` (placeholder), `lib/api.ts` (bare client), `rich-text.tsx` ready, all ecommerce component dirs are `.gitkeep` stubs | No layout/header/footer, no catalog, no data fetching | **The milestone** (SS-124–SS-128) |
| Shared packages | Partial | `packages/types` has admin-shaped DTOs only (no public catalog types); `packages/api-client` is a thin fetch wrapper | No public-contract types | **Add catalog types** (SS-119) |
| Docker / reproducibility | Complete for dev | `docker-compose.yml`: postgres 16, redis 7, api (FFmpeg installed, persistent `api_product_media` volume, watermark env), admin (Vite dev), storefront (Next dev); CI installs FFmpeg (`​.github/workflows/ci.yml`) | Images run dev servers, not production builds (pre-existing, out of M2 scope) | Keep compatible; no new services |
| Tests | Backend strong | 69 `*.spec.ts` files in `apps/api/src` + e2e/integration suites in `apps/api/test/` (per-domain `*.e2e-spec.ts`, `*.integration-spec.ts`) | Storefront has no test harness | Extend backend harness; minimal storefront unit tests |

### Issue numbering

Highest referenced issue ID anywhere in the repository: **SS-118**. This plan
continues from **SS-119**. (GitHub-side sub-issue/epic scripts in `scripts/`
confirm the SS-### convention; CATALOG-### in docs are requirement module IDs,
not GitHub issues.)

---

## Existing Architecture Relevant to This Milestone

### Backend conventions (must be preserved)

- **Modular monolith**, one module per domain; controllers thin, services own
  business logic and Prisma access (`AGENTS.md` §4; consistent with actual code).
- **Global API prefix** `/api/v1`; public controllers today: `auth`, `partners`,
  `description-images`, `health`. Admin controllers under `admin/*` guarded by
  `jwt-auth.guard.ts` + `roles.guard.ts` with `@Roles(...)` decorators
  (`CUSTOMER | PARTNER | OPERATOR | ADMIN` — `auth/enums/app-role.enum.ts`).
- **Validation** via global pipe + DTOs (`class-validator`), list endpoints use
  query DTOs with pagination consistent with `packages/types/src/api/pagination.ts`.
- **Soft delete** (`deletedAt`) everywhere; public queries must filter it.
- **Lifecycle gates**: products are only meaningful publicly when
  `status = PUBLISHED` and not soft-deleted; ARCHIVED products are hidden
  (admin editor blocks them — `apps/admin/src/pages/product-editor-page.tsx:56-69`).
- **Media serving pattern to copy**: the public description-image controller
  streams with `Cache-Control: public, max-age=31536000, immutable`,
  `@SkipThrottle()`, and strict filename validation against server-generated
  format (`apps/api/src/modules/products/description-images.controller.ts:152-185`).
- **Inventory read path**: SS-112 introduced the read-only aggregate
  (`apps/api/src/modules/inventory/inventory-aggregate.ts`) with inactive
  warehouses excluded — the correct source for storefront availability
  (`docs/02-requirements/feature-specifications/inventory-management.md:80-119`).

### Admin frontend conventions (reference for storefront quality bar)

RTL-first (`<html lang="fa" dir="rtl">`), Vazirmatn font, Catalyst-based
components, hand-rolled data hooks with request-sequence race guards, Persian
error translation, `Loading`/`EmptyState` conventions
(`apps/admin/src/...` — see status matrix). The storefront must meet the same
RTL/Persian/UX bar using **Tailwind Plus Ecommerce** components instead of
Catalyst (per `AGENTS.md` §9).

### Storefront foundations already in place

- `apps/storefront/src/app/layout.tsx`: `lang="fa" dir="rtl"`, metadata template — done.
- `apps/storefront/src/lib/api.ts`: `createApiClient` from `@sabz/api-client`
  with `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:3000/api/v1`) — done.
- `apps/storefront/src/components/rich-text.tsx`: sanitized-HTML renderer with
  RTL typography — done, ready for product descriptions.
- `apps/storefront/src/app/globals.css`: `.rich-text` styles — done.

---

## What Is Already Complete

Everything the proposed (old) Milestone 2 named, **except its public face**:

- Category domain: model, tree, reorder, admin UI.
- Product domain: model, variants, lifecycle, admin editor.
- Media: upload, validation, image/video processing, watermarking (FFmpeg in
  Docker image + CI), storage on persistent volume, admin-side serving.
- Inventory: warehouses, ledger movements, reservations, admin UI.
- Pricing schema foundation (`PartnerTier`).
- Storefront shell primitives: RTL layout, API client, rich-text renderer.

## What Is Partial

- Pricing: base retail price only; no tier application anywhere in code.
- Storefront: shell exists; zero catalog functionality.
- `packages/types`: admin contracts only; no public catalog contract.
- Docker images: dev-server oriented (acceptable for now, flagged as risk).

## What Is Missing

- Public catalog API (products, categories, brands, availability).
- Public product media serving.
- Storefront: layout shell (header/footer/nav), product card, listing page,
  category pages, product detail page, home page.
- Public-contract shared types.

## Problems / Technical Debt Blocking Progress

None hard-blocking, but four items must be handled consciously:

1. **Legacy `ProductVariant.stockQuantity`** — deprecated as a writer by SS-113
   (`docs/02-requirements/feature-specifications/inventory-management.md:175-186`)
   but still in the schema and admin variant flows. Public catalog code MUST
   read availability from the inventory aggregate, never `stockQuantity`.
   Removal is an optional cleanup issue (SS-130).
2. **No public media URL** — the single architectural piece M1 deferred. Solved
   by SS-123 following the description-images pattern.
3. **No image derivatives/thumbnails** — the stored, watermarked original is
   the only asset. Serving originals in listing grids is a performance risk;
   SS-129 (approved) adds thumbnail generation to the processing pipeline.
4. **No storefront data-fetching conventions** — admin's hand-rolled hook
   pattern doesn't translate to Next.js server components; storefront should
   fetch server-side where possible and keep client state minimal.

---

## Milestone Goals

1. A guest visitor can browse the full published catalog in Persian/RTL:
   home → categories → filtered product listing → product detail with media.
2. Every image/video shown is a watermarked asset served publicly and
   cache-immutably, with no exposure of storage internals.
3. Availability shown on listing and detail reflects the real inventory
   aggregate (inactive warehouses excluded).
4. All public endpoints are read-only, unauthenticated, validated, paginated,
   and consistent with existing API conventions (`docs/05-api/api-specification.md`).
5. The system remains fully reproducible: clone → `.env` → `docker compose up`.

## Scope

### In Scope

- Public catalog API contract + shared types (SS-119).
- Public categories/brands read API (SS-120).
- Public product listing API (filters, search, sort, pagination, availability) (SS-121).
- Public product detail API (SS-122).
- Public product media serving (SS-123).
- Storefront layout shell: header, footer, category navigation (SS-124).
- Product card + product listing page with filters/sort/pagination (SS-125).
- Category browsing pages (SS-126).
- Product detail page: gallery, video, variant display, price, availability,
  rich-text description (SS-127).
- Home page with featured categories and latest products (SS-128).
- Media thumbnails in the processing pipeline (SS-129 — **approved**).
- Legacy `stockQuantity` cleanup (SS-130 — optional, post-review).
- Demo seed catalog sourced from sabzsistem.com, normalized to Toman (SS-131).
- Documentation: `docs/05-api/api-specification.md` public API sections; new
  `docs/02-requirements/feature-specifications/storefront-catalog.md` (SS-119).

### Out of Scope (explicitly deferred)

- **Cart, checkout, orders, payments, coupons** — `AGENTS.md` §13 prohibits
  payment/checkout/order implementations unless explicitly requested; they are
  a later milestone even though `docs/01-planning/milestones.md` lumps them
  into "Milestone 2 — Marketplace & Sales". This plan **challenges that
  roadmap**: shipping the storefront catalog first leaves the system shippable
  and lets sales features build on a live catalog.
- **Partner tier pricing on the storefront** (PRICE-003) — requires customer/
  partner authentication on the storefront, which does not exist. Retail price
  only this milestone (Decision 2).
- **Customer accounts / login on the storefront.**
- **Search beyond name matching** (no Elasticsearch/Postgres FTS this milestone).
- **Wishlist, reviews, blog, Torob integration** (roadmap M2/M3 items, later).
- **Object-storage (S3-compatible) media driver** — already a recorded future
  work item (SS-038/SS-105 comments in `docker-compose.yml:81-92`).
- **Production Docker builds / CDN** — pre-existing gap, separate track.
- **Admin feature changes** — none required; admin is untouched.

## Domain Model

Current, verified against `apps/api/prisma/schema.prisma` (no changes proposed
for core M2):

```text
Category (adjacency tree: parentId → Category, onDelete: SetNull)
  ├─ sortOrder, isVisible, slug @unique, soft delete
  └─ products → Product

Brand (slug @unique, logoKey, isFeatured)
  └─ products → Product

Product (slug @unique, status DRAFT|PUBLISHED|ARCHIVED, condition, dims, warranty)
  ├─ categoryId (required), brandId (required)
  ├─ variants → ProductVariant (sku @unique, price Decimal(12,2), barcode)
  │    ├─ media → ProductMedia (variant-scoped)
  │    └─ inventoryItems → InventoryItem
  └─ media → ProductMedia (product-scoped)

ProductMedia (mediaType IMAGE|VIDEO, storageKey @unique,
              sortOrder, isPrimary, soft delete)

Warehouse (code @unique, status ACTIVE|INACTIVE)
  └─ InventoryItem (@unique [variantId, warehouseId],
                    quantityOnHand, quantityReserved, reorderLevel, criticalLevel)
      ├─ InventoryMovement (type, quantity, reservedDelta,
      │                     onHandBefore/After, reservedBefore/After — append-only ledger)
      └─ Reservation (status ACTIVE|RELEASED|CONSUMED|EXPIRED, expiresAt)

PartnerTier (name @unique, discountPercent Decimal(5,2), minOrderQuantity) — unused by catalog code

Indexes that matter publicly: Product @@index([status, deletedAt]),
@@index([categoryId, deletedAt]), @@index([brandId, deletedAt]);
Category @@index([parentId]), @@index([isVisible, deletedAt]);
ProductMedia @@index([productId, sortOrder]).
```

Public-read visibility rules derived from existing behavior:

- Product visible ⟺ `status = PUBLISHED ∧ deletedAt IS NULL`.
- Category visible in nav ⟺ `isVisible ∧ deletedAt IS NULL`.
- Media visible ⟺ owning product published ∧ media not soft-deleted.
- Availability = Σ(quantityOnHand − quantityReserved) over ACTIVE warehouses
  (SS-112 aggregate semantics; inactive warehouses never contribute).

## Category Architecture

**Already built — nothing to redesign.** Adjacency list with per-sibling
`sortOrder`, cycle-safe reorder implemented admin-side, soft delete with
`SetNull` parent. Milestone action is consumption only: a public tree endpoint
returning visible categories with published-product counts (approved,
Decision 6) and the storefront nav menu. No materialized path / nested-set
migration is justified at this scale.

## Product Architecture

**Already built.** The public surface is a read-only projection of the existing
`Product`/`ProductVariant` aggregates:

- Listing card DTO: `id, slug, name, brand{name,slug}, category{slug},
  primaryImageUrl, priceFrom, inStock, condition`.
- Detail DTO: card fields + `shortDescription, description (sanitized HTML),
  warranty, dimensions, variants[{id, sku, name, price, inStock}],
  media[{id, url, mediaType, isPrimary, sortOrder}]`.
- `priceFrom` = `MIN(variant.price)` (single-variant products dominate; computed
  in query — no denormalization until measured need, Decision 5).
- Slug-based public lookup (`slug @unique` already indexed).

## Rich Text Architecture

**No work required — deliberately.** The admin TipTap 3 editor persists
allowlist-sanitized HTML (`img[src][alt]` only, `src` restricted to https or
same-origin `/api/v1/description-images/...` — `docs/05-api/api-specification.md`
description-images section). The storefront already has the matching renderer
(`apps/storefront/src/components/rich-text.tsx`). Inline description images
already have a public immutable endpoint. No editor migration (no TipTap
change), no format change, no new node types. This validates the M1 decision to
treat images as semantic `<figure data-align data-width>` nodes.

## Media Architecture

Current: upload → validate (magic bytes, per-type caps: images 10 MB, videos
200 MB) → temp dir → process/watermark (sharp image pipeline; FFmpeg for video,
logo + Vazirmatn text overlay, configurable position/opacity/size) → final
local-disk storage (`/app/.data/product-media`, named volume) → metadata row.
The stored binary **is** the watermarked asset.

Milestone additions (SS-123):

- `GET /catalog/media/:mediaId` — public, auth-free, `StreamableFile`,
  `Cache-Control: public, max-age=31536000, immutable`, `@SkipThrottle()`.
  The handler verifies the media row exists, is not soft-deleted, and its
  product is PUBLISHED — media of drafts/archived/deleted products 404s.
  Strict UUID format validation on `:mediaId` (same traversal-proofing as
  description-images). Serving by `mediaId` (checked against published
  product) rather than raw `storageKey` keeps storage keys out of public DTOs
  and prevents enumeration of unrelated assets.
- No re-processing, no new pipeline stages, no queue. Synchronous processing
  at upload remains correct at this scale (admin-only writers, small volume).
- SS-129 (approved) adds exactly one pipeline output: a watermarked thumbnail
  derivative per image, stored alongside the original (see issue SS-129).

## Inventory Architecture

**Already built; consume the read aggregate only.** The catalog never writes
inventory and never writes `ProductVariant.stockQuantity`. SS-121/122 call the
existing SS-112 aggregate helper (`inventory-aggregate.ts`) to derive
`inStock` per variant/product. Reservation expiry, movements, and warehouse
management remain admin concerns. This is exactly the "clean foundation for
the later order/checkout milestone" the inventory spec intended.

## Pricing Architecture

This milestone ships **retail display only**: `ProductVariant.price` displayed
as **Toman (تومان)**, `fa-IR` formatting (Decision 1). `priceFrom` on cards.
No pricing engine, no promotions, no tier application. The `PartnerTier`
schema stays as-is. Building the pricing engine now would be speculative —
its first real consumer (cart/checkout or partner portal) does not exist yet.

## Storefront Architecture

- **Next.js App Router, server components first**: listing and detail pages
  fetch on the server via `lib/api.ts` (fast, no client waterfalls); filters,
  pagination, and gallery interactions are client components.
- **Routes**: `/` (home), `/products` (listing, search params encode
  `?q=&category=&brand=&sort=&page=`), `/products/[slug]` (detail),
  `/categories/[slug]` (→ listing preset with category filter), and `/cart`
  (UI-only placeholder this milestone — see Component completeness below).
- **Component source (binding)**: `ecommerce-v4.zip` (Tailwind Plus Ecommerce
  v4, committed at `docs/assets/ecommerce-v4.zip`). Its `html/components/*`
  and `html/page-examples/*` are the canonical markup source; port selected
  markup into React components under `apps/storefront/src/components/ecommerce/*`
  (JSX + RTL/Persian adaptation), never vendoring the raw HTML as routes.
- **Component completeness (binding, owner decision 2026-09-20)**: the entire
  chrome and all major UI surfaces exist **from the first storefront issue** —
  header with search/cart/account, category nav, footer, cart page, and
  placeholders for account/order flows — even where functionality (cart,
  checkout, orders, auth) arrives in later issues/milestones. Non-functional
  surfaces render their real Tailwind Plus markup with Persian placeholder
  content and disabled/empty states, so the storefront never shows stub text.
- **Components** (Tailwind Plus Ecommerce patterns, per `AGENTS.md`):
  `header` (with category nav), `footer`, `product-card`, `product-gallery`
  (images + video), `filters-sidebar`, `pagination`, `price` (fa-IR
  formatting), `availability-badge`. The `src/components/ecommerce/*`
  stub directories are the intended homes.
- **Data contract types** come from `@sabz/types` (SS-119), not ad-hoc
  interfaces — one source of truth for API + storefront.
- **Images** (Decision 4): `next/image` with `images.remotePatterns` covering
  the API host (dev: `localhost:3000`) — or, if DTO URLs are absolute and
  origin-coupled, a same-origin Next rewrite proxy for media paths so remote
  patterns stay environment-independent. SS-129 thumbnails keep optimization
  cheap; the detail gallery renders originals.
- **State**: URL search params are the single source of truth for
  filters/sort/page. No react-query introduction this milestone.
- **Tests**: vitest for pure helpers (price/number formatting, search-param
  encoding). No component-test harness invention (per planning prompt §19);
  manual QA per issue.

## API Contract Changes

All new endpoints are **public, read-only, no auth**. Conventions follow
`docs/05-api/api-specification.md` (pagination envelope, Persian-free English
error codes, DTO validation). Full request/response shapes are specified in
SS-119 and then recorded in the API spec — summary:

```text
GET /catalog/categories
  → tree of visible, non-deleted categories with published-product counts
    [{id, name, slug, sortOrder, publishedProductCount, children: [...]}]

GET /catalog/brands
  → paginated [{id, name, slug}]

GET /catalog/products?page&limit&q&category&brand&condition&sort
  sort: newest | price_asc | price_desc | name
  → paginated ProductCardDto (priceFrom, inStock, primaryImageUrl)

GET /catalog/products/:slug
  → ProductDetailDto (variants, media URLs, category breadcrumb, availability)

GET /catalog/media/:mediaId
  → binary stream (watermarked asset), immutable cache headers
  Errors: 404 (missing/deleted/unpublished product/invalid uuid)
```

Errors: standard `400/404`; no auth errors (public). Pagination envelope and
error body identical to existing endpoints (`packages/types/src/api/*`).

Binding contract decisions: all prices are **Toman** (stored `Decimal(12,2)`,
display-formatted `fa-IR` — Decision 1); media objects carry `url` plus a
nullable `thumbnailUrl` (SS-129) and never expose `storageKey`; categories
carry `publishedProductCount` (Decision 6).

## Database Changes

One approved schema change (SS-129); otherwise none — SS-119–SS-128 read
existing tables and indexes:

- SS-129 (thumbnails, approved): add nullable `thumbnailKey` to `ProductMedia`
  — one additive migration, backward compatible (null → fall back to the
  original asset; videos have none).
- SS-130 (optional cleanup): drop `ProductVariant.stockQuantity` — migration
  after admin flows stop reading it.

Seed changes ship via SS-131 (Decision 7): the seed is extended to publish a
demo catalog sourced from sabzsistem.com so the acceptance test works out of
the box.

## Security / Authorization

- Every new endpoint is public by design (guest browsing); the security work is
  **negative space**: nothing write-shaped is exposed, soft-deleted and
  unpublished data is filtered at the service layer (backend-authoritative —
  frontend filtering is UX only), and storage cannot be traversed.
- Media endpoint is the sensitive surface: strict UUID validation, published-
  product gate, no storage keys in any public DTO, immutable cache headers,
  throttle-exempt like description-images (assets are immutable; pages embed
  many).
- No new roles/permissions (stay CUSTOMER/PARTNER/OPERATOR/ADMIN; no
  SUPER_ADMIN). Admin endpoints untouched.
- Description HTML is already sanitized server-side before storage; storefront
  renders it via the existing `RichText` component only.

## Testing Strategy

Backend (extend the existing harness — `apps/api/test/*.e2e-spec.ts` /
`*.integration-spec.ts` pattern):

- Public listing: published-only visibility, soft-delete exclusion, pagination
  boundaries, each filter/sort combination, `priceFrom` correctness with
  multi-variant products.
- Public detail: 404 for draft/archived/deleted/slug-miss; variant + media shape.
- Media serving: 200 + content-type + cache headers for published; 404 for
  draft/archived/deleted product media, deleted media, malformed uuid.
- Categories/brands: visibility rules, tree shape.
- Auth regression: confirm new routes are intentionally auth-free and no admin
  route became public (guards snapshot).

Storefront:

- Unit tests (vitest, already configured in the workspace): price/number
  `fa-IR` formatting, filter search-param encode/parse, category tree → nav
  mapping.
- No new frontend test infrastructure; manual QA checklist per issue (RTL
  layout, Persian copy, loading/error/empty states, dark-media behavior N/A).

Manual QA (each storefront issue): fresh `docker compose up` → seed → exercise
page at 360px and 1440px widths, verify Persian text and RTL, verify empty and
error states (stop API container to see error state).

## Docker / Deployment Impact

**No new services, volumes, or system packages.** FFmpeg is already in the API
image and CI. Public media streams from the existing `api_product_media`
volume. Storefront keeps running as the Next dev server in Compose with
`NEXT_PUBLIC_API_BASE_URL` unchanged. Flags:

- Dev-only posture unchanged (dev servers in Compose) — pre-existing,
  documented in README; production builds remain a separate track.
- No upload-size, proxy, or reverse-proxy changes (public reads only).
- Verify the media volume path is **not** host-path dependent (it is a named
  volume — reproducibility preserved).

## Dependency Graph

```text
SS-119 Catalog contract + types + storefront spec
  ├─→ SS-120 Categories/brands public API ──┐
  ├─→ SS-121 Product listing public API ────┼─→ SS-124 Storefront shell + nav ─→ SS-128 Home
  └─→ SS-122 Product detail public API ─────┘
SS-123 Public media serving ────────→ (feeds media URLs used by 124–128)
SS-123 → SS-129 Thumbnails (pipeline + backfill; parallel with storefront issues)
SS-121 + SS-123 + SS-124 ─→ SS-125 Listing page ─→ SS-126 Category pages
SS-122 + SS-123 + SS-124 ─→ SS-127 Product detail page
SS-124 + SS-125 ─→ SS-128 Home
SS-131 Demo seed catalog — after SS-123 (media pipeline); parallel with storefront issues
SS-130 stockQuantity cleanup (optional) — independent
```

## Parallelization Opportunities

- After SS-119: **SS-120, SS-121, SS-122, SS-123 are mutually parallel**
  (separate controllers/services; only shared contract).
- After the shell (SS-124): **SS-125/126 and SS-127 are parallel** (different
  pages), as is SS-128 once listing exists.
- SS-129 (thumbnails) is backend-only and parallel with the storefront issues.
- SS-131 (seed) runs in parallel with the storefront issues once SS-123 lands.
- SS-130 is fully independent.

## GitHub Issue Breakdown

Format per project convention; branch `feat/ss-xxx-...`. Each issue is
executable with the issue text + repository alone; "Assumes" lists what the
implementing agent may take as given.

---

### SS-119 — Public catalog contract, shared types & storefront spec

- **Purpose:** One place defining the public catalog API before any endpoint
  exists, so parallel implementation issues never diverge.
- **Why:** M1 deferred the public API; four issues will implement it in
  parallel and need a fixed contract.
- **Dependencies:** None. **Blocks:** SS-120–128.
- **Files:** `docs/02-requirements/feature-specifications/storefront-catalog.md` (new,
  mirrors `product-catalog.md` style), `docs/05-api/api-specification.md` (new
  public section), `packages/types/src/catalog/*.ts` (new: card, detail,
  category-tree, brand, availability), `packages/types/src/index.ts`.
- **Backend/Frontend/DB changes:** types only; no endpoints, no schema.
- **Testing:** `pnpm typecheck` on workspace; types compile.
- **DoD:** contract documented; types exported; both agents can code against
  them without re-reading the API.
- **Risks:** contract drift — mitigated by documenting *and* typing in the
  same issue.
- **Assumes:** existing pagination/error types in `packages/types/src/api/`.

### SS-120 — Public categories & brands read API

- **Purpose:** `GET /catalog/categories` (visible tree) and
  `GET /catalog/brands` (paginated) for navigation.
- **Dependencies:** SS-119. **Parallel with:** SS-121, SS-122, SS-123.
- **Files:** new `products/public-catalog.controller.ts` + `public-catalog.service.ts`
  (or `catalog` controller trio inside products module, following existing
  controller-per-concern pattern: `categories.controller.ts` analog).
- **Backend:** visibility filter (`isVisible ∧ !deletedAt`), tree assembly
  (reuse admin tree logic shape), brand list reusing `brands.service.ts` query.
- **Testing:** e2e + integration specs per harness pattern (visibility, tree
  shape, pagination).
- **DoD:** endpoints documented in API spec section added by SS-119; specs pass.
- **Risks:** exposing draft-category subtrees — mitigated by visibility filter tests.
- **Assumes:** SS-119 types; existing `Category`/`Brand` services.

### SS-121 — Public product listing API

- **Purpose:** `GET /catalog/products` with `q`, `category` (slug), `brand`
  (slug), `condition`, `sort`, pagination; card DTO with `priceFrom`,
  `primaryImageUrl`, `inStock`.
- **Dependencies:** SS-119; uses SS-123's URL shape (contract only — can merge
  after SS-123 or with placeholder URLs swapped; implement after SS-123 to
  keep DTO real).
- **Files:** extends the SS-120 controller/service (or `catalog-products.*`).
- **Backend:** `status=PUBLISHED ∧ !deletedAt`; `priceFrom = MIN(variant.price)`
  via grouped select; `inStock` via SS-112 aggregate helper; name `ILIKE` search;
  sort map (newest/price_asc/price_desc/name) whitelisted; pagination per
  existing envelope. No new indexes (existing `[status, deletedAt]`,
  `[categoryId, deletedAt]` suffice at this scale).
- **Testing:** e2e/integration — published-only, filters, sorts, priceFrom with
  multi-variant, inStock true/false, pagination edges.
- **Risks:** N+1 on variants/media — use single `include`/`select`; price-sort
  performance — acceptable now (Decision 5: denormalize only on measured need).
- **Assumes:** SS-112 aggregate helper API; SS-119 types.

### SS-122 — Public product detail API

- **Purpose:** `GET /catalog/products/:slug` → full detail DTO (variants,
  media, breadcrumb, per-variant availability).
- **Dependencies:** SS-119. **Parallel with:** SS-120/121/123.
- **Files:** same catalog controller/service as SS-121.
- **Backend:** slug lookup, published gate, ordered media (`sortOrder`,
  primary first), variants with `inStock`, category breadcrumb by walking
  `parentId` (depth ≤ small; in-memory walk).
- **Testing:** 404 matrix (draft/archived/deleted/unknown slug), DTO shape,
  breadcrumb, media ordering.
- **Assumes:** SS-119 types.

### SS-123 — Public product media serving

- **Purpose:** `GET /catalog/media/:mediaId` streaming the watermarked asset
  publicly with immutable caching. **The key new infrastructure of M2.**
- **Dependencies:** none technically; **implement before SS-121/122** so their
  DTO URLs are real. **Parallel with:** SS-120/122.
- **Files:** `products/public-media.controller.ts` (modeled line-by-line on
  `description-images.controller.ts` public controller), `media.service.ts`
  (new public read method), `storage/product-media-storage.ts` (read stream
  exposure if missing).
- **Backend:** strict UUID validation on `:mediaId`; row must exist, not be
  soft-deleted; owning product must be PUBLISHED and not deleted; stream with
  stored MIME type; `Cache-Control: public, max-age=31536000, immutable`;
  `@SkipThrottle()`; 404 otherwise. Storage keys never appear in responses.
- **Testing:** e2e — cache headers, content-type, 404 matrix (malformed uuid,
  deleted media, draft/archived product media), no key leakage.
- **Review:** **stronger-model review required before merge** (public
  unauthenticated file-serving surface).
- **Risks:** serving non-public media (tested), storage traversal (impossible
  via uuid-by-id design; tests prove it).
- **Assumes:** existing storage abstraction + watermark pipeline untouched.

### SS-124 — Storefront shell: layout, header, footer, nav, cart placeholder

- **Purpose:** the complete RTL/Persian app shell all pages live in —
  **including UI-only surfaces whose functionality comes later** (owner
  decision: full UI from day one).
- **Dependencies:** SS-119 (types), SS-120 (categories API for nav).
- **UI completeness:** header (logo, category nav, search entry, cart icon
  with badge placeholder, account icon placeholder), mobile drawer, footer
  (from ecommerce-v4 `store-navigation` + `footer` markup), plus a `/cart`
  route rendering the ecommerce-v4 shopping-cart component with an explicit
  Persian empty state (non-functional: no add-to-cart sources yet). Account/
  order links render but route to an informative placeholder.
- **Files:** `apps/storefront/src/components/ecommerce/{header,footer,category,cart}/`
  (replace `.gitkeep` stubs), `app/layout.tsx` (shell composition), `app/cart/page.tsx`,
  `lib/api.ts` (typed fetch helpers), `lib/format.ts` (fa-IR price/number
  helpers + tests).
- **Component source:** `docs/assets/ecommerce-v4.zip` (extracted reference).
- **Frontend:** Tailwind Plus Ecommerce header/footer; category nav from API;
  mobile drawer (RTL-correct like admin's `translate-x-full` pattern);
  loading/error/empty conventions mirroring admin quality bar; Vazirmatn.
- **Testing:** unit tests for `lib/format.ts`, nav mapping; manual QA (RTL,
  360px/1440px).
- **DoD:** every page route renders inside the shell; nav shows real categories.
- **Assumes:** Tailwind v4 setup present; no UI library additions.

### SS-125 — Product card & product listing page

- **Purpose:** `/products` grid with search, category/brand/condition filters,
  sort, pagination — URL search params as source of truth.
- **Dependencies:** SS-121, SS-123, SS-124.
- **Files:** `components/ecommerce/product-card/`, `app/products/page.tsx`
  (server component fetch + client filter controls), `components/ecommerce/…`
  filters/pagination.
- **Testing:** unit tests for search-param encode/parse; manual QA matrix
  (each filter × sort × RTL).
- **Risks:** full-size original images in grid (mitigated if SS-129 approved;
  else lazy-loading + fixed aspect boxes).
- **Assumes:** card DTO from SS-121; media URLs from SS-123.

### SS-126 — Category browsing pages

- **Purpose:** `/categories/[slug]` — category landing reusing the SS-125
  listing with a preset category filter; category tree navigation.
- **Dependencies:** SS-125 (and SS-120).
- **Files:** `app/categories/[slug]/page.tsx`, shared listing component
  extraction from SS-125.
- **Testing:** 404 for invisible/deleted/unknown category; manual QA.
- **Assumes:** SS-125 shared listing primitives.

### SS-127 — Product detail page

- **Purpose:** `/products/[slug]` — gallery (images + video player), variant
  display, price, availability badge, breadcrumbs, `RichText` description,
  SEO metadata (`generateMetadata`).
- **Dependencies:** SS-122, SS-123, SS-124.
- **Files:** `app/products/[slug]/page.tsx`, `components/ecommerce/product-gallery/`.
- **Testing:** unit tests for gallery state logic; manual QA (video playback of
  watermarked asset, RTL gallery, empty-description products).
- **Assumes:** detail DTO from SS-122; `rich-text.tsx` component (exists).

### SS-128 — Home page

- **Purpose:** real home: hero, featured categories (SS-120), latest products
  (SS-121 `sort=newest`).
- **Dependencies:** SS-120, SS-121, SS-123, SS-124 (after SS-125's card).
- **Files:** `app/page.tsx`, `components/ecommerce/{hero,promo}/`.
- **Testing:** manual QA; graceful degradation when catalog empty.

### SS-129 — Media thumbnails in the processing pipeline (approved)

- **Purpose:** listing grids must not download multi-megabyte watermarked
  originals. Generate a thumbnail derivative (e.g., max 640px WEBP) during the
  existing image-processing stage; serve it publicly; use it in listing cards.
- **Dependencies:** SS-123 (serving). **Parallel with:** storefront issues.
- **DB:** one additive migration — nullable `ProductMedia.thumbnailKey`
  (null = no thumbnail; consumers fall back to the original; videos get none).
- **Files:** `apps/api/prisma/schema.prisma` + migration,
  `media-processing/image-processor.service.ts` (thumbnail step, watermarked
  like the original to keep brand protection uniform),
  `storage/local-disk-media.storage.ts` (persist both assets), `media.service.ts`
  (delete both files on media delete; expose `thumbnailUrl` in DTOs),
  SS-121/122 card DTOs prefer `thumbnailUrl` (detail gallery keeps originals),
  plus a one-off backfill for existing media rows.
- **Testing:** pipeline integration (thumbnail generated and size-capped,
  watermark applied), media delete removes both files, 404 semantics
  unchanged, backfill idempotent.
- **DoD:** new uploads carry thumbnails; existing rows backfilled; listing
  cards reference thumbnails via SS-121 DTOs.
- **Risks:** ~doubles image storage (acceptable at this scale); backfill runs
  only on dev volumes.

### SS-130 — (Optional) Remove legacy `ProductVariant.stockQuantity`

- **Purpose:** finish the SS-113 deprecation — remove the column after admin
  variant flows stop reading/writing it.
- **Dependencies:** independent; audit admin variant UI first.
- **DB:** migration dropping column; **Files:** variants DTOs/services, admin
  variant components if they display it.

### SS-131 — Demo seed catalog from sabzsistem.com

- **Purpose:** a published demo catalog (categories, brands, products,
  variants, media) so storefront QA and the acceptance test work on a fresh
  `docker compose up` with no manual admin work.
- **Dependencies:** SS-123 (seeded media must be publicly servable); ideally
  after SS-129 so thumbnails backfill immediately. **Parallel with:**
  storefront issues.
- **Source:** the current customer website sabzsistem.com — WordPress/
  WooCommerce. Import the category tree (کالای دیجیتال and its children), a
  small representative set of real product titles/models per category, brand
  names, and current prices. **Normalize prices to Toman (÷10): the live site
  displays Rial, the storefront contract is Toman (Decision 1).** Do not
  import sale/compare-at pricing, cart fields, or blog content.
- **Files:** `apps/api/prisma/seed.ts` (extend; keep existing identity/admin
  seeding intact; respect the development-only seed gating), plus committed
  seed fixtures (JSON) and bundled sample product images under
  `apps/api/prisma/seed-catalog/`.
- **Media approach:** create `ProductMedia` rows through the existing media
  service so watermarking/processing/storage layout match production behavior;
  do not hand-place files in the storage volume. Prefer committing a small
  image set as repo fixtures over scraping the live site at boot time.
- **Constraints:** idempotent (safe re-run); every product PUBLISHED with a
  primary image; include at least one multi-variant product and one
  video-bearing product to exercise gallery/variant UI paths.
- **Testing:** fresh Compose stack + seed → `/catalog/categories` tree with
  counts, `/catalog/products` listing, `/catalog/products/:slug` detail,
  `/catalog/media/:id` 200 — i.e., acceptance-test steps 1–4 pass.
- **DoD:** acceptance test runs out of the box on fresh clone.
- **Risks:** currency mismatch (mitigated by ÷10 normalization + spot checks
  against the live site); data drift from live site (fixtures are a snapshot —
  acceptable for demo purposes).

---

## Recommended Implementation Order

```text
SS-119  contract & types                       (OpenCode)
  → SS-123  public media serving               (OpenCode; stronger-model review)
  → SS-120  categories/brands API   ┐ parallel (OpenCode)
  → SS-122  product detail API      ┘          (OpenCode)
  → SS-121  product listing API                (OpenCode)
  → SS-129  media thumbnails                   (OpenCode)
  → SS-124  storefront shell                   (Muse Spark; review by stronger model)
  → SS-131  demo seed catalog                  (either; OpenCode preferred)
  → SS-125  listing page            ┐ parallel (Muse Spark)
  → SS-127  product detail page     ┘          (Muse Spark)
  → SS-126  category pages                    (either)
  → SS-128  home page                          (either)
  → SS-130  stockQuantity cleanup (optional)   (either)
```

Every merge leaves `pnpm lint / typecheck / test / build` green and the
Compose stack working (shippable-at-all-times).

## Agent Assignment Strategy

- **OpenCode** — all backend issues (SS-119–123): they touch API contract,
  Prisma queries, and the public security surface; strongest fit and review
  leverage. SS-123 additionally gets a **stronger-reasoning-model review**
  before merge (public file serving).
- **Muse Spark 1.3 Free** — storefront UI issues (SS-124–128): well-scoped,
  contract-typed, low architectural risk; SS-124 (shell) reviewed once by a
  stronger model since every later page inherits its decisions.
- **Either** — SS-126, SS-128, SS-130; SS-131 preferably OpenCode (Prisma
  seed + media-pipeline integration).
- Per the workflow (`docs/07-development/ai-development-workflow.md`): one
  issue → implement → `pnpm lint/typecheck/test/build` → review/audit → next.

## Milestone Definition of Done

- All in-scope issues merged with convention-compliant commits/PRs.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` green in CI.
- API spec + new storefront-catalog spec committed; `.env.example` unchanged
  (no new env vars required).
- End-to-end acceptance test passes on a fresh `docker compose up` from clone.
- No admin regression: existing e2e suites untouched and passing.

## End-to-End Acceptance Test

Fresh machine: clone → `cp .env.example .env` → `docker compose up` → seed.

1. Open `http://localhost:3002` — home shows header with Persian category nav
   (from the SS-131 demo seed), featured categories, latest published products.
2. Navigate a category — filtered listing renders with cards
   (thumbnail image, name, price in Persian numerals + تومان, availability
   badge); category nav counts match listing results.
3. Search and filter by brand/condition; change sort; paginate — URL reflects
   state; results update; empty state shows when no matches.
4. Open a product — gallery shows watermarked images (primary first); video
   plays if present; variant prices/availability per variant; rich-text
   description renders (RTL, inline description images visible).
5. Open a draft or archived product's slug — 404.
6. `GET /api/v1/catalog/media/<mediaId-of-draft-product>` — 404.
7. Media responses carry `Cache-Control: public, max-age=31536000, immutable`.
8. Verify a variant with zero available stock in all active warehouses shows
   out-of-stock; add stock via admin inventory receive; storefront reflects it
   on refresh.
9. Log into admin (`:5173`) — catalog admin flows unchanged (spot check:
   category reorder, product publish).
10. `docker compose down && docker compose up` — catalog, media, and
    descriptions persist (named volumes); no re-upload needed.
11. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass.

## Risk Register

| Risk | Probability | Impact | Mitigation |
| --- | --- | --- | --- |
| Public media endpoint leaks unpublished/deleted assets | Low | High | Published-product gate + 404 matrix tests; stronger-model review (SS-123) |
| Listing performance with full-size watermarked images | High | Medium | SS-129 thumbnails (approved) + `next/image` sizing (Decision 4) |
| Seed import currency mismatch — live site displays Rial, storefront contract is Toman | High | Medium | SS-131 normalizes values ÷10 at import; spot-check against sabzsistem.com |
| Live-site snapshot drift (WooCommerce data changes before seed authoring) | Low | Low | Fixtures committed as a one-time snapshot; no live scraping at boot |
| Storefront/API contract drift across parallel issues | Medium | Medium | SS-119 ships types + doc together; both consume `@sabz/types` |
| Availability read couples catalog to inventory incorrectly (e.g., `stockQuantity`) | Medium | High | SS-121/122 mandated to use SS-112 aggregate; review checklist item |
| RTL/Persian quality below admin bar | Medium | Medium | SS-124 stronger-model review; manual QA matrix per issue |
| Scope creep toward cart/checkout (roadmap pressure) | Medium | High | Out-of-scope list in this doc; AGENTS.md §13 restrictions cited in issues |
| Price-sort/`priceFrom` query cost at catalog growth | Low | Medium | Measured later; denormalization path documented (Decision 5) |
| Docker dev-server posture misread as production-ready | Medium | Low | README already frames dev; production-build track flagged, not in M2 |

## Decisions (Resolved 2026-09-20)

All seven open questions are resolved by the product owner; these are binding
for every issue above:

1. **Currency:** display prices as **Toman (تومان)** with `fa-IR` formatting.
   Discovery from research: sabzsistem.com (WordPress/WooCommerce) currently
   displays **Rial** — so the SS-131 seed import must normalize values to
   Toman (÷10), and the SS-119 contract documents Toman as the display unit.
2. **Partner tier pricing on the storefront:** deferred to a partner-portal /
   storefront-auth milestone. M2 ships retail price only.
3. **Thumbnails (SS-129): approved.** Additive nullable `thumbnailKey` column,
   watermarked thumbnail generation inside the existing image-processing
   pipeline, backfill for existing media, graceful fallback to the original.
4. **Storefront images:** `next/image` with `images.remotePatterns` for the
   API host, or a same-origin Next rewrite proxy for media paths.
5. **`priceFrom`:** compute `MIN(variant.price)` per query; add a denormalized
   `Product.minPrice` only on measured need.
6. **Category nav:** includes `publishedProductCount` per category.
7. **Seed data:** a published demo catalog ships with the seed so the
   acceptance test works out of the box; content is sourced from the current
   customer website sabzsistem.com (category tree under کالای دیجیتال, product
   titles/models, brand names, current prices — no sale pricing, no cart
   fields), committed as fixtures rather than scraped at runtime.
