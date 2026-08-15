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
|       +-- nationalId: string
|       +-- tier: PartnerTier
|       +-- businessAddress (province, city, fullAddress) — business/legal
|       |      operating address, distinct from the profile's personal
|       |      address (SS-028)
|       +-- businessDocuments: BusinessDocument[]
|
+-- Role (many-to-many via UserRole, sole authorization source)
|   +-- id: UUID
|   +-- name: string (CUSTOMER, PARTNER, OPERATOR, SUPER_ADMIN)
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
+-- name: string (Tier 1, Tier 2, Tier 3)
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
+-- title: string
+-- slug: string
+-- description: text
+-- status: ProductStatus (DRAFT, PUBLISHED, ARCHIVED)
+-- sku: string
+-- categoryId: UUID
+-- brandId: UUID
+-- createdAt: DateTime
|
+-- Category
|   +-- id: UUID
|   +-- name: string
|   +-- slug: string
|   +-- parentId: UUID (self-referencing)
|   +-- sortOrder: int
|
+-- Brand
|   +-- id: UUID
|   +-- name: string
|   +-- slug: string
|
+-- ProductMedia
|   +-- id: UUID
|   +-- url: string
|   +-- type: MediaType (IMAGE, VIDEO)
|   +-- sortOrder: int
|   +-- isWatermarked: boolean
|
+-- ProductSpecification
|   +-- id: UUID
|   +-- key: string
|   +-- value: string
|
+-- Inventory
    +-- id: UUID
    +-- quantity: int
    +-- reservedQuantity: int
    +-- warehouseId: UUID
    +-- status: StockStatus (IN_STOCK, LOW_STOCK, OUT_OF_STOCK)
```

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
| VerificationStatus | PENDING, VERIFIED, REJECTED |
| BusinessType | DISTRIBUTOR, WHOLESALER, RETAIL_SHOP, SYSTEM_INTEGRATOR, CORPORATE |
| ProductStatus | DRAFT, PUBLISHED, ARCHIVED |
| StockStatus | IN_STOCK, LOW_STOCK, OUT_OF_STOCK |
| OrderStatus | PENDING, CONFIRMED, PROCESSING, SHIPPED, DELIVERED, CANCELLED, RETURNED |
| PaymentStatus | PENDING, SUCCESS, FAILED, REFUNDED |
| ShippingStatus | PENDING, PICKED_UP, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED |