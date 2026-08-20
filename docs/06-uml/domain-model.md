# Sabz System Platform
# Domain Model

Version: 1.0

---

# Overview

This document describes the core domain model for the Sabz System Platform. The domain is organized around four primary aggregates: User Management, Product Catalog, Order Management, and Content Management.

---

# Domain Entities

## User Aggregate

The **User** is the identity root entity. All people in the platform — B2C customers, B2B partners, admin users, and operators — are represented as a User with a profile extension and roles. **Customer** and **Partner** are classifications expressed through roles, not inheritance hierarchies.

```
User (identity root)
+-- id: UUID
+-- mobile: string (unique)
+-- email: string? (unique if provided)
+-- passwordHash: string? (nullable for future auth methods)
+-- status: UserStatus
+-- lastLoginAt: DateTime?
+-- createdAt: DateTime
+-- updatedAt: DateTime
+-- deletedAt: DateTime?
|
+-- UserProfile (one-to-one)
|   +-- id: UUID
|   +-- firstName: string
|   +-- lastName: string
|   +-- avatarUrl: string?
|   +-- address: string? (personal/contact address of the user; SS-028)
|   +-- addresses: Address[] (shipping/billing addresses, future)
|   |
|   +-- Customer (role CUSTOMER, no dedicated table)
|   |
|   +-- Partner (the partner application aggregate — one persistent row per
|   |            profile, enforced by unique profileId; access granted through
|   |            the PARTNER role upon approval)
|       +-- approvalStatus: PartnerApprovalStatus (DRAFT | PENDING | APPROVED
|       |      |       | REJECTED), default DRAFT
|       +-- approvedAt / submittedAt / rejectedAt: DateTime?
|       +-- rejectionReason / reviewNotes: string?
|       +-- nationalId: string?
|       +-- tier: PartnerTier
|       +-- businessAddress (province, city, fullAddress) — business/legal
|       |      operating address, distinct from the profile's personal
|       |      address (SS-028)
|       +-- businessDocuments: BusinessDocument[]
|
+-- Role (many-to-many via UserRole, sole authorization source)
|   +-- id: UUID
|   +-- name: string (CUSTOMER, PARTNER, OPERATOR, ADMIN)
|   +-- permissions: Permission[] (via RolePermission)
|
+-- Permission (many-to-many via RolePermission)
|   +-- id: UUID
|   +-- name: string
|   +-- resource: string
|   +-- action: string
|
+-- UserSession
    +-- id: UUID
    +-- refreshToken: string
    +-- deviceId: string?
    +-- ipAddress: string?
    +-- expiresAt: DateTime
    +-- revokedAt: DateTime?

PartnerTier
+-- id: UUID
+-- name: string (Tier 1 – Distributor, Tier 2 – Wholesaler, Tier 3 – Retailer)
+-- discountPercentage: decimal(5,2)
+-- minOrderQuantity: int

Address
+-- id: UUID
+-- province: string
+-- city: string
+-- fullAddress: string
+-- postalCode: string
+-- isDefault: boolean
```

### Partner lifecycle (SS-038)

The Partner aggregate owns the onboarding lifecycle:

```
DRAFT
  ↓
PENDING
  ↓
APPROVED
  or
REJECTED
  ↓
PENDING  (corrected and resubmitted)
```

There is exactly one persistent Partner row per UserProfile (v1 invariant,
enforced by the unique `profileId`).

### BusinessDocument (SS-038)

```
BusinessDocument
+-- id: UUID
+-- partnerId: UUID (-> Partner)
+-- type: PartnerDocumentType
|       (BUSINESS_LICENSE | NATIONAL_ID | TAX_REGISTRATION | SUPPORTING)
+-- originalName: string        (display-only)
+-- mimeType: string            (application/pdf | image/png | image/jpeg)
+-- sizeBytes: int              (max 10 MB)
+-- storageKey: string (unique) (server-generated, never derived from filename)
+-- createdAt / updatedAt / deletedAt
```

Metadata is stored in PostgreSQL; **binary file contents are stored outside the
database** through the Partner-domain `DocumentStorage` abstraction. Storage
paths are never exposed as public URLs.

---

## Product Aggregate

```
Product
+-- id: UUID
+-- name: string
+-- slug: string (unique)
+-- shortDescription: string?
+-- description: text?
+-- condition: ProductCondition (NEW | OPEN_BOX | REFURBISHED | USED | STOCK_CLEARANCE)
+-- status: ProductStatus (DRAFT | PUBLISHED | ARCHIVED)
+-- brandId: UUID (required)
+-- categoryId: UUID (required)
+-- warranty: string?
+-- weightKg / widthCm / heightCm / depthCm: decimal?
+-- originCountry: string?
+-- createdAt: DateTime
+|
+-- Category
+|   +-- id: UUID
+|   +-- name: string
+|   +-- slug: string (unique)
+|   +-- parentId: UUID (self-referencing, unlimited depth)
+|   +-- sortOrder: int
+|   +-- isVisible: boolean
+|
+-- Brand
+|   +-- id: UUID
+|   +-- name: string
+|   +-- slug: string (unique)
+|   +-- description: string?
+|   +-- logoKey: string? (storage reference; binary in SS-105)
+|   +-- isFeatured: boolean
+|
+-- ProductVariant (owns the sellable SKU + retail/base price)
+|   +-- id: UUID
+|   +-- productId: UUID
+|   +-- sku: string (unique, variant-owned)
+|   +-- barcode: string?
+|   +-- name: string? (display label only; attributes deferred to SS-104)
+|   +-- price: decimal(12,2) (retail/base price)
+|   +-- stockQuantity: int (M1 catalog availability snapshot; EPIC-006 owns real inventory)
+|
+-- ProductMedia
+|   +-- id: UUID
+|   +-- productId: UUID (required; product-owned)
+|   +-- variantId: UUID? (optional variant link)
+|   +-- mediaType: ProductMediaType (IMAGE | VIDEO)
+|   +-- originalName / mimeType / sizeBytes
+|   +-- storageKey: string (unique, server-generated; binary outside DB)
+|   +-- sortOrder: int
+|   +-- isPrimary: boolean
+|
+-- ProductSpecification (deferred to SS-104)
+|
+-- Inventory (EPIC-006 / SS-109 — schema foundation applied)
+    +-- Warehouse
+    |   +-- id: UUID
+    |   +-- code: string (unique; the infrastructure default is code 'DEFAULT')
+    |   +-- name: string
+    |   +-- address / contactName / contactPhone: string?
+    |   +-- status: WarehouseStatus (ACTIVE | INACTIVE), default ACTIVE
+    |   +-- soft-delete: deletedAt + audit fields
+    +-- InventoryItem (authoritative — one row per variant + warehouse)
+    |   +-- id: UUID
+    |   +-- variantId: UUID (-> ProductVariant, ON DELETE RESTRICT)
+    |   +-- warehouseId: UUID (-> Warehouse, ON DELETE RESTRICT)
+    |   +-- quantityOnHand: int (default 0)
+    |   +-- quantityReserved: int (default 0)
+    |   +-- reorderLevel / criticalLevel: int?
+    |   +-- @@unique([variantId, warehouseId])
+    +-- InventoryMovement (immutable append-only ledger; no update/delete columns)
+    |   +-- id: UUID
+    |   +-- inventoryItemId: UUID (-> InventoryItem, ON DELETE RESTRICT)
+    |   +-- variantId / warehouseId: string (denormalized snapshots)
+    |   +-- type: InventoryMovementType (M1 + forward members)
+    |   +-- quantity: int, reservedDelta: int (default 0)
+    |   +-- reason / notes / reference: string? (reference is internal-only)
+    |   +-- onHandBefore / onHandAfter / reservedBefore / reservedAfter: int
+    |   +-- createdAt / createdBy
+    +-- Reservation
+        +-- id: UUID
+        +-- inventoryItemId: UUID (-> InventoryItem, ON DELETE RESTRICT)
+        +-- quantity: int
+        +-- status: ReservationStatus (ACTIVE | RELEASED | CONSUMED | EXPIRED), default ACTIVE
+        +-- expiresAt / releasedAt / consumedAt / expiredAt: DateTime?
+        +-- createdAt / createdBy / updatedBy
```

> **Inventory semantics (SS-109):** `InventoryItem` is authoritative;
> `ProductVariant.stockQuantity` is retained as a denormalized M1 aggregate that
> future EPIC-006 mutations refresh in the same transaction. **available =
> quantityOnHand − quantityReserved** (derived, never stored). Existing
> `stockQuantity` values are backfilled into the default warehouse exactly once
> by the idempotent bootstrap helper. No inventory API/UI exists yet.
```

> **SS-100 notes:** the sellable SKU is owned by **ProductVariant** — Product has
> no SKU. The variant retail/base price lives on ProductVariant. `stockQuantity`
> is a temporary M1 snapshot, not the EPIC-006 system of record. ProductMedia is
> product-owned with an optional `variantId`; its binary contents are stored
> behind a Product-domain storage abstraction (SS-105), not the Partner
> `DocumentStorage`. Product lifecycle in M1 is `DRAFT → PUBLISHED → ARCHIVED`.

---

## Order Aggregate

```
Order
+-- id: UUID
+-- orderNumber: string
+-- status: OrderStatus
    (PENDING, CONFIRMED, PROCESSING, SHIPPED, DELIVERED, CANCELLED, RETURNED)
+-- totalAmount: decimal
+-- discountAmount: decimal
+-- customerId: UUID
+-- shippingAddressId: UUID
+-- createdAt: DateTime
|
+-- OrderItem
|   +-- id: UUID
|   +-- productId: UUID
|   +-- quantity: int
|   +-- unitPrice: decimal
|   +-- totalPrice: decimal
|   +-- totalPriceWithDiscount: decimal
|
+-- Payment
|   +-- id: UUID
|   +-- amount: decimal
|   +-- status: PaymentStatus (PENDING, SUCCESS, FAILED, REFUNDED)
|   +-- gateway: string
|   +-- transactionId: string
|   +-- paidAt: DateTime
|
+-- Shipping
    +-- id: UUID
    +-- carrier: string
    +-- trackingCode: string
    +-- status: ShippingStatus
    +-- estimatedDelivery: DateTime
```

---

## Content Aggregate

```
BlogPost
+-- id: UUID
+-- title: string
+-- slug: string
+-- content: text
+-- excerpt: string
+-- status: PostStatus (DRAFT, PUBLISHED)
+-- authorId: UUID
+-- publishedAt: DateTime
+-- seoTitle: string
```

---

# Value Objects

- **Money**: Amount + currency (IRR)
- **PhoneNumber**: Validated Iranian phone number
- **NationalId**: Validated Iranian national identification number
- **Slug**: URL-friendly identifier generated from titles
- **Address**: Structured address with province, city, and postal code. Represents user shipping/billing addresses (future) — distinct from the UserProfile personal address and the Partner business address (SS-028).

---

# Enumerations

| Enum | Values |
|------|--------|
| UserStatus | PENDING_OTP, ACTIVE, SUSPENDED, LOCKED |
| PartnerApprovalStatus | DRAFT, PENDING, APPROVED, REJECTED |
| PartnerDocumentType | BUSINESS_LICENSE, NATIONAL_ID, TAX_REGISTRATION, SUPPORTING |
| Role | CUSTOMER, PARTNER, OPERATOR, ADMIN (role names stored in the Role table; sole authorization source) |
| ProductStatus | DRAFT, PUBLISHED, ARCHIVED |
| ProductCondition | NEW, OPEN_BOX, REFURBISHED, USED, STOCK_CLEARANCE |
| ProductMediaType | IMAGE, VIDEO |
| WarehouseStatus | ACTIVE, INACTIVE (EPIC-006 / SS-109) |
| InventoryMovementType | INITIAL_STOCK, PURCHASE_RECEIPT, SALE, RESERVATION, RESERVATION_RELEASE, MANUAL_ADJUSTMENT, DAMAGE, RETURN_RECEIVED, RETURN_REJECTED, STOCK_TRANSFER, HOLO_IMPORT (EPIC-006 / SS-109) |
| ReservationStatus | ACTIVE, RELEASED, CONSUMED, EXPIRED (EPIC-006 / SS-109) |
| OrderStatus | PENDING, CONFIRMED, PROCESSING, SHIPPED, DELIVERED, CANCELLED, RETURNED |
| PaymentStatus | PENDING, SUCCESS, FAILED, REFUNDED |
| ShippingStatus | PENDING, PICKED_UP, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED |

> **Enum notes:** there is no `VerificationStatus` enum; the Partner lifecycle is
> tracked by `PartnerApprovalStatus` and per-document verification is future
> work (see [Database Design Specification](../04-database/database-design-specification.md)).
> The `BusinessType` enum is a legacy concept from the planned password-based
> partner registration design (see [Partner Registration Flow](partner-registration-flow.md))
> and is **not implemented**.
> The earlier `StockStatus` (IN_STOCK, LOW_STOCK, OUT_OF_STOCK) is **not
> stored** in SS-109; stock status is derived at runtime from
> `reorderLevel`/`criticalLevel` versus available quantity. Low-stock alerting
> is deferred (EPIC-006 M3).