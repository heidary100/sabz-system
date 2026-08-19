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