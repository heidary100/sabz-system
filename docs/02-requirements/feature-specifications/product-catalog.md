# Sabz System Platform
# Feature Specification – Product Catalog

Version: 1.0

Module ID: CATALOG-001

Status: Approved for Development

Milestone: 1 (Core), Milestone 2 (Enhancements)

Priority: Critical (P1)

---

# 1. Purpose

The Product Catalog module manages the complete lifecycle of products, categories, brands, attributes, media, variants, and product visibility.

It serves as the central source of truth for all products displayed on the Sabz System Platform.

---

# 2. Goals

- Organize products into hierarchical categories
- Support configurable product attributes and variants
- Manage product media (images & videos)
- Provide SEO-friendly product pages
- Support both new and stock/refurbished products
- Enable future marketplace expansion

---

# 3. Actors

- Guest
- Customer
- Partner
- Operator
- Super Administrator

---

# 4. Business Rules

### CATALOG-001

Every product belongs to at least one category.

---

### CATALOG-002

Each product must have a unique SKU.

---

### CATALOG-003

Each product has a unique SEO slug.

---

### CATALOG-004

Archived products remain visible in historical orders but cannot be purchased.

---

### CATALOG-005

Products may have multiple images and videos.

---

### CATALOG-006

The first image is the primary thumbnail.

---

### CATALOG-007

Every uploaded product image is automatically watermarked before publication.

---

### CATALOG-008

A product may have one or more variants.

---

### CATALOG-009

Inventory is tracked at the variant level.

---

### CATALOG-010

Stock/Refurbished products must clearly indicate their condition.

---

# 5. Product Lifecycle

Draft

↓

Pending Review (optional)

↓

Published

↓

Hidden

↓

Archived

Only Published products are visible to customers.

---

# 6. Functional Requirements

## Categories

The system shall support:

- Unlimited hierarchy
- Category images
- Category SEO metadata
- Sort order
- Visibility toggle

---

## Brands

The system shall support:

- Brand logo
- Brand description
- Brand SEO page
- Featured brands

---

## Products

Each product shall include:

- SKU
- Name
- Slug
- Short description
- Full description
- Brand
- Category
- Warranty
- Condition
- Status
- Weight
- Dimensions
- Country of origin

---

## Product Variants

Variants may include:

- Color
- Capacity
- Size
- Package
- Model

Each variant maintains:

- SKU
- Barcode
- Inventory
- Price adjustments
- Images

---

## Product Attributes

Examples:

- CPU
- RAM
- Storage
- GPU
- Display
- Ports
- Connectivity
- Power
- Material
- Compatibility

Attributes must be configurable without requiring code changes.

---

## Media

Supported media:

Images

- JPG
- PNG
- WEBP

Videos

- MP4

Media Features

- Multiple images
- Multiple videos
- Thumbnail generation
- Watermarking
- Image optimization
- Video preview

---

## Product Conditions

The platform shall support:

- New
- Open Box
- Refurbished
- Used
- Stock Clearance

Condition badges must be displayed prominently.

---

## Related Products

Products may reference:

- Similar products
- Accessories
- Frequently bought together
- Replacement products

---

# 7. User Stories

### CATALOG-US-001

As an Operator,

I want to create products,

so they become available for sale.

Acceptance Criteria

- Required fields validated.
- SKU unique.
- Slug generated automatically (editable).
- Product saved as Draft or Published.

---

### CATALOG-US-002

As a Customer,

I want to browse products by category,

so I can easily find relevant products.

Acceptance Criteria

- Category hierarchy displayed.
- Pagination supported.
- Empty categories handled gracefully.

---

### CATALOG-US-003

As a Customer,

I want to view complete product specifications,

so I can compare products before purchasing.

Acceptance Criteria

- Technical specifications displayed.
- Images load correctly.
- Videos are playable.
- Related products displayed.

---

### CATALOG-US-004

As an Operator,

I want to upload product images,

so products have professional presentation.

Acceptance Criteria

- Images validated.
- Watermark applied automatically.
- Optimized version generated.
- Thumbnail generated.

---

### CATALOG-US-005

As a Customer,

I want to clearly see whether a product is New, Refurbished, or Open Box,

so I understand its condition before buying.

Acceptance Criteria

- Product condition displayed on listing and details pages.
- Condition included in search filters.

---

# 8. API Endpoints

Public

GET /products

GET /products/{slug}

GET /products/search

GET /products/featured

GET /products/latest

GET /products/stock

GET /categories

GET /brands

Administration

POST /admin/products

PATCH /admin/products/{id}

DELETE /admin/products/{id}

POST /admin/products/{id}/publish

POST /admin/products/{id}/archive

POST /admin/products/{id}/media

POST /admin/products/{id}/variants

POST /admin/categories

POST /admin/brands

---

# 9. Validation Rules

Product Name

- Required
- Maximum 255 characters

SKU

- Required
- Unique

Slug

- Required
- Unique

Category

- Required

Brand

- Required

Images

- Minimum one primary image

Videos

- Optional

Warranty

- Optional

Condition

- Required

---

# 10. Search & Filtering

Customers shall be able to filter by:

- Category
- Brand
- Price
- Availability
- Product condition
- Warranty
- Rating (future)
- Discount (future)

Sorting

- Newest
- Price: Low to High
- Price: High to Low
- Best Selling
- Most Viewed (future)
- Alphabetical

---

# 11. SEO Requirements

Each product shall have:

- SEO title
- Meta description
- Canonical URL
- Open Graph metadata
- Structured data (Schema.org Product)

Category and brand pages shall also support SEO metadata.

---

# 12. Authorization

Guest

- Browse catalog

Customer

- Browse catalog

Partner

- Browse catalog
- View partner pricing (after Pricing Engine evaluation)

Operator

- Create products
- Edit products
- Archive products
- Upload media

Super Administrator

- Full catalog administration

---

# 13. Audit Events

The system shall record:

- Product creation
- Product updates
- Product publication
- Product archival
- Category changes
- Brand changes
- Media uploads
- Variant creation
- Attribute updates

---

# 14. Dependencies

Requires:

- Authentication & Identity
- Media Service
- Inventory
- Pricing Engine

Provides services to:

- Search
- Orders
- Checkout
- SEO
- Torob Integration
- Reporting

---

# 15. Test Scenarios

Positive Tests

- Create category
- Create brand
- Create product
- Upload images
- Upload videos
- Publish product
- Archive product
- Create variant
- Display product page

Negative Tests

- Duplicate SKU
- Duplicate slug
- Missing required category
- Invalid media type
- Missing primary image
- Invalid product condition
- Unauthorized product modification

---

# 16. Applied Schema Notes (SS-100)

The following are the applied EPIC-005 schema decisions established by SS-100.
They record how the feature spec is realized in the current Prisma schema:

1. **SKU is owned by ProductVariant.** The sellable SKU lives on `ProductVariant`
   (unique). Product has **no** sellable SKU field. This overrides any earlier
   reading of CATALOG-002 that implied a product-level SKU; the purchasable unit
   is the variant.
2. **ProductVariant owns the retail/base price** (`Decimal(12,2)`). Tier pricing,
   discounts, `PricingRule`, promotions, and bulk pricing are **not** part of
   EPIC-005 and are deferred.
3. **`ProductVariant.stockQuantity` is a temporary M1 catalog availability
   snapshot**, not the future EPIC-006 inventory system of record (warehouses,
   reservations, movements/history, receiving, returns, reorder, reporting).
   **SS-109 handoff:** `InventoryItem` becomes authoritative; `stockQuantity`
   is retained as the denormalized M1 aggregate, and existing values are
   backfilled into the default warehouse exactly once by the idempotent
   bootstrap helper. Future EPIC-006 mutations update `InventoryItem` and
   refresh `stockQuantity` in the same transaction; removing `stockQuantity`
   is **not** part of SS-109. **SS-113 handoff:** receive/adjust and the
   SS-104 `PATCH /admin/variants/:id/inventory` compatibility endpoint now
   route through the single inventory write path, so every stock write
   refreshes `stockQuantity` from the authoritative `InventoryItem` rows in
   the same transaction. The SS-104 variant **create** `stockQuantity` field
   remains a direct M1 snapshot and is a documented residual gap (see
   inventory-management.md, SS-113 applied decisions).
4. **ProductMedia uses a separate product-domain storage boundary.** Metadata
   lives in PostgreSQL (`storageKey` server-generated and unique); binaries live
   behind the Product-domain `ProductMediaStorage` abstraction (SS-105). The
   Partner `DocumentStorage` is not reused.
5. **Product lifecycle in M1 is `DRAFT → PUBLISHED → ARCHIVED`.** The optional
   Pending Review workflow is not implemented. `HIDDEN` is not in M1 and may be
   added later as a forward enum migration.
6. **No tier pricing in EPIC-005.**
7. **`ProductVariant.name` is a display label only**; configurable attributes
   (color/capacity/size/etc.) are deferred to SS-104. No EAV or
   `ProductAttribute`/`ProductAttributeValue` tables exist in SS-100.
8. **Category uses one required `categoryId` on Product** in M1 (no
   `ProductCategory` junction table).
9. **ProductMedia is Product-owned** (`productId` required) with an optional
   `variantId` for variant-specific media.

The first-image-primary rule (CATALOG-006) and product publish invariants
(at least one variant, required data) are **application-level** invariants
enforced in later issues (SS-102/SS-103/SS-104/SS-105); the schema stores the
fields required for those validations (`isPrimary`, `sortOrder`, etc.).

---

# 17. Applied Decisions — SS-102 (Admin Product API)

The following decisions were resolved while implementing the operator/admin
product administration API (SS-102). They extend the SS-100/SS-101 schema
notes with API-level behavior.

1. **Creation always produces `DRAFT`.** Clients may not create a product
   directly as `PUBLISHED`. A submitted `status` other than `DRAFT` is
   rejected with 400; `DRAFT` is ignored. Publication is an explicit
   lifecycle action via `POST /admin/products/{id}/publish`.
2. **Slug.** When `slug` is omitted it is generated deterministically from
   `name` (lowercase, runs of non-alphanumeric characters collapsed to a
   hyphen, trimmed, capped at 255 chars; falls back to a random suffix when
   the sanitized name is empty). No external slug library is used. Duplicate
   slug returns 409, including under P2002 races.
3. **Publish prerequisite.** Publishing requires **at least one non-deleted
   variant** (CATALOG-008 / §16.9). It does **not** require `stockQuantity >
   0` or a primary image — those are SS-104/SS-105 concerns and are not
   documented publish blockers for M1.
4. **Lifecycle.** `DRAFT → PUBLISHED → ARCHIVED`, with no reverse transitions
   in M1. `PATCH` does **not** accept a `status`; status changes occur only
   through the publish/archive endpoints, and an archived product cannot be
   updated (409).
5. **Delete.** Only `ARCHIVED` products may be soft-deleted (other statuses →
   409). Deletion sets `deletedAt`/`updatedBy`; it does not hard-delete and
   does not cascade to variants or media (SS-104/105 own their child
   lifecycle).
6. **Audit events.** `PRODUCT_CREATED`, `PRODUCT_UPDATED`, `PRODUCT_PUBLISHED`,
   `PRODUCT_ARCHIVED`, and `PRODUCT_DELETED`. Payloads contain only safe
   business-state deltas; storage keys, secrets, and `createdBy`/`updatedBy`
   are never included.
7. **Brand/category references.** SS-102 only reads references (SS-103 owns
   their CRUD/deletion). Creating/updating verifies the referenced brand and
   category exist and are not soft-deleted; missing/soft-deleted references
   return 404.
8. **Variant/media reads.** `GET /admin/products/{id}` returns the full
   `ProductDetail` contract including `variants` and `media` (read-only,
   non-deleted rows only, no storage internals). SS-102 exposes no
   variant/media mutation endpoints.
9. **Pricing boundary.** `Product` has no price and no SKU. The retail/base
   price and the sellable SKU live on `ProductVariant` (SS-104). Price does
   not appear in any SS-102 product input.

---

# 17A. Applied Decisions — SS-103 (Admin Category & Brand API)

The following decisions were resolved while implementing the operator/admin
category and brand administration API (SS-103). They extend the SS-100/SS-101
schema notes with API-level behavior.

1. **Module placement.** Categories and Brands live inside the existing
   `ProductsModule` (one controller + one service per resource). No separate
   module and no generic catalog abstraction.
2. **Slug.** `slug` is optional on create and generated deterministically from
   `name` when omitted (lowercase, runs of non-alphanumeric characters collapsed
   to a hyphen, trimmed, capped at 255 chars; falls back to a `<entity>-<random>`
   suffix when the sanitized name is empty). The tiny pure helper is shared with
   `ProductsService` via `apps/api/src/modules/products/slug.ts`. Duplicate slug
   returns 409, including under P2002 races. `slug` may be changed via PATCH.
3. **Uniqueness.** Only `slug` is unique. Duplicate category names are allowed
   (even under the same parent); no name-uniqueness constraint is added.
4. **Category hierarchy.** Unlimited depth. `parentId: null` means root.
   Self-parenting is rejected (409). Moving a category under one of its own
   descendants is rejected (409) via an application-level ancestor walk inside
   the transaction. A soft-deleted parent cannot be referenced (404).
5. **Category delete.** Soft-delete only (`deletedAt`/`updatedBy`; no hard
   delete, no cascade). Deletion is rejected with 409 when the category has
   non-deleted children or is referenced by non-deleted products. Children are
   not auto-re-parented.
6. **Brand delete.** Soft-delete only. Deletion is rejected with 409 when the
   brand is referenced by non-deleted products (required `Product.brandId` FK).
7. **Brand `isFeatured`.** `isFeatured` is part of the product-catalog
   requirement (featured brands) and is administrable in SS-103: it is returned
   by GET list/detail and accepted on create/update. It defaults to `false`.
   `logoKey` is **not** exposed or accepted in SS-103; brand logo/media belongs
   to SS-105.
8. **List filters.** Category and brand lists support pagination only. The
   shared `CategoryListQuery`/`BrandListQuery` contracts carry `page`/`limit`
   and no search or filter fields; none are added.
9. **Projections.** Explicit Prisma `select` projections only. Responses never
   expose `logoKey`, `deletedAt`, `createdBy`, `updatedBy` (or `storageKey`).
   `CategoryDetail` returns exactly one level of non-deleted children. There is
   no `BrandDetail` contract; `BrandSummary` is reused for brand detail.
10. **Audit events.** `CATEGORY_CREATED`, `CATEGORY_UPDATED`, `CATEGORY_DELETED`,
    `BRAND_CREATED`, `BRAND_UPDATED`, `BRAND_DELETED`. Payloads contain only
    safe business-state deltas (changed fields, or deletion metadata on delete);
    storage keys, secrets, and `createdBy`/`updatedBy` are never included.
11. **Authorization.** All category/brand endpoints require `OPERATOR` or
    `ADMIN` (`JwtAuthGuard` + `RolesGuard`). No SUPER_ADMIN, no permission guard.

---

# 17B. Applied Decisions — SS-104 (Admin Product Variant & Minimal Inventory API)

The following decisions were resolved while implementing the operator/admin
product variant API and the EPIC-005 minimal inventory boundary.

1. **Module placement.** Variant CRUD and the inventory endpoint live inside the
   existing `ProductsModule` (two thin controllers — `ProductVariantsController`
   at `admin/products` and `AdminVariantsController` at `admin/variants` — both
   delegating to a single `VariantsService`). No `InventoryModule` is created:
   EPIC-005 owns only the temporary `ProductVariant.stockQuantity` boundary;
   EPIC-006 owns the real inventory subsystem.
2. **SKU.** Globally unique via the DB `@unique` constraint; duplicate `sku`
   returns 409 under P2002 (race-safe, no pre-check dependency). SKU is
   trimmed and bounded (max 64); no stricter format is imposed by the catalog
   requirements.
3. **Price.** Required, positive, `Decimal(12,2)`; accepted and returned as a
   string (never a JS number), consistent with `PartnerTier.discountPercent`.
   Tier pricing, discounts and pricing rules remain out of scope.
4. **Inventory semantics — absolute set.** `PATCH /admin/variants/:id/inventory`
   replaces `stockQuantity` with an absolute value `>= 0`. No delta, no
   movement/history record: the adjustment-with-reason and movement semantics
   in `inventory-management.md` are EPIC-006 scope. The M1 boundary is exactly
   `ProductVariant.stockQuantity`. The write is atomic and conditional on
   `deletedAt IS NULL`; stock can never become negative.
5. **Variant `name`.** `ProductVariant.name` is an optional display label only
   (SS-100 note #7). No EAV / `ProductAttribute` / configurable attributes are
   introduced in SS-104.
6. **Lifecycle.** Creating or mutating a variant requires the owning product to
   exist, not be soft-deleted (404) and not be `ARCHIVED` (409). Variant
   update and inventory writes are additionally conditional at the row level on
   the variant and its owning product still being active, so a mutation racing a
   concurrent archive or soft-delete fails cleanly instead of writing against a
   now-archived/deleted product. Variant deletion is soft-delete only; a deleted
   variant can never be resurrected or mutated. Deleting the only variant of a
   published product does not auto-unpublish — the publish precondition applies
   only at publish time.
7. **Audit events.** `PRODUCT_VARIANT_CREATED`, `PRODUCT_VARIANT_UPDATED`,
   `PRODUCT_VARIANT_DELETED` and `PRODUCT_INVENTORY_SET`. A price change is
   captured by `PRODUCT_VARIANT_UPDATED`'s before/after delta (no separate
   price-change event). Payloads are minimal business deltas only; price is a
   string; no secrets, storage keys, filesystem paths or full Prisma records.
8. **Response contract.** `VariantSummary` (existing SS-101 contract) is reused
   for list, detail, update, delete and inventory responses. No `VariantDetail`
   and no new shared types are introduced.
9. **EPIC-006 handoff.** `ProductVariant.stockQuantity` is the temporary M1
   availability snapshot; `InventoryItem` is authoritative from SS-109 onward.
   SS-112 (EPIC-006) adds the read-only admin inventory API and the shared
   aggregate helper that projects
   `stockQuantity = SUM(InventoryItem.quantityOnHand)` across active,
   non-deleted warehouses. This endpoint (`PATCH /admin/variants/:id/inventory`)
   remains the temporary M1 write boundary and is repointed through the
   inventory write path by SS-113 (deprecated, not removed in M1). Removal of
   `stockQuantity` is future work.

---

# 17C. Applied Decisions — SS-105 (Product Media API & Storage Foundation)

The following decisions were resolved while implementing the operator/admin
product media API and the Product-domain media storage abstraction.

1. **Product-domain storage abstraction.** A separate `ProductMediaStorage`
   abstraction (`put`/`get`/`delete`) is introduced under
   `apps/api/src/modules/products/storage/` with a `LocalDiskMediaStorage`
   implementation. It is deliberately **not** the Partner `DocumentStorage`
   (SS-038/039): partner documents and product media have different security
   and lifecycle semantics, and the SS-100 schema note records this
   product-specific storage boundary. No S3 dependency is added; object storage
   is future work behind the same seam.
2. **Storage security.** The `storageKey` is server-generated
   (`products/<productId>/<mediaId>.<ext>`), never derived from the client
   filename. `originalName` is sanitized and display-only. The local-disk
   implementation rejects traversal, absolute paths, Windows drive paths,
   backslashes, NUL bytes, and any root escape. `storageKey`, absolute paths,
   and the storage root are never exposed in responses, audit payloads, or
   errors.
3. **Validation.** Images JPG/PNG/WEBP and video MP4 (from the product-catalog
   spec) are accepted. Images are validated by MIME + magic bytes; MP4 is
   validated by MIME + the ISOBMFF `ftyp` container signature only — no
   codec/stream validation (no media parser exists in M1). A single 10 MB cap
   applies to all media, enforced at both the multipart interceptor and the
   service. A declared `mediaType` that contradicts the detected content is
   rejected.
4. **Primary-image semantics (CATALOG-006).** The first uploaded IMAGE
   automatically becomes primary; only one IMAGE may be primary; videos are
   never primary. The invariant is enforced transactionally by row-locking the
   owning product (`SELECT ... FOR UPDATE`) so concurrent first-uploads
   serialize and cannot produce two primaries. Uploading the first image with
   `isPrimary: false` is rejected (409) so a product can never have zero
   primary images. Deleting the primary promotes the next image by `sortOrder`
   inside the same transaction.
5. **Ordering.** `sortOrder` is server-generated (incrementing per product) and
   is not client-controlled in SS-105. A dedicated reorder endpoint and primary
   switching are deferred; they are not part of this issue.
6. **Deletion / retention.** `DELETE /admin/media/:id` soft-deletes the
   `ProductMedia` row (with audit) transactionally, then removes the binary
   post-commit; a binary-removal failure is logged, never rolled back after the
   DB commit (the SS-039 filesystem/DB consistency model). Uploads write the
   binary first and best-effort clean the orphaned binary if the DB write
   fails. Deleting variant-associated media does not delete the variant.
7. **Variant association.** A supplied `variantId` must exist, not be
   soft-deleted, and belong to the same product (404 otherwise). No
   variant-specific media business logic beyond this relationship.
8. **Product state gating.** Media uploads require the product to exist and not
   be soft-deleted (404) and not be `ARCHIVED` (409), matching the variant
   mutation rule.
9. **Audit events.** `PRODUCT_MEDIA_UPLOADED` and `PRODUCT_MEDIA_REMOVED`.
   Payloads contain only safe metadata (product/variant ids, media type, MIME,
   size, sortOrder/isPrimary). No `PRODUCT_MEDIA_PRIMARY_CHANGED` event is
   introduced because primary changes are side effects of upload/delete and are
   captured by those events. `storageKey` and filesystem paths are never
   included.
10. **Endpoints.** `POST /admin/products/:productId/media`, `GET
    /admin/products/:productId/media`, `GET
    /admin/products/:productId/media/:mediaId`, and `DELETE /admin/media/:id`.
    All require `OPERATOR`/`ADMIN`. The product-scoped media list is provided as
    an independent contract; `ProductDetail.media` (SS-102) is unchanged and
    reflects only active media ordered by `sortOrder`.
11. **Deferred processing.** Watermarking (CATALOG-007), image optimization,
    thumbnail generation, and video transcoding are **not** implemented in
    SS-105. No `isWatermarked`/processing fields are added to the schema, and no
    sharp/ffmpeg/queue/worker dependency is introduced. These remain M2 work.
12. **No public delivery.** SS-105 exposes only authenticated admin
    download/preview. No public URLs, CDN, or storefront media APIs are added;
    the `ProductMediaStorage` interface stays minimal (`put`/`get`/`delete`)
    with no signed-URL generation. Public/storefront delivery can introduce a
    public-media adapter later without changing Product business logic.
13. **Shared types.** `ProductMediaSummary` (SS-101) fully covers the JSON
    metadata response; no new `@sabz/types` contract is introduced.
14. **Environment.** New `PRODUCT_MEDIA_STORAGE_DRIVER`/`DIR` variables follow
    the `DOCUMENT_*` conventions, and a dedicated `api_product_media` named
    volume persists media at `/app/.data/product-media` inside Docker Compose.

---

# 18. Definition of Done

The Product Catalog module is complete when:

- Categories, brands, products, and variants can be managed.
- Media uploads and watermarking work correctly.
- Products support SEO metadata.
- Product lifecycle states function correctly.
- Product condition is displayed consistently.
- Search and filtering operate as specified.
- Unit, integration, and user acceptance tests pass.
- The module is approved during the Milestone 1 review.