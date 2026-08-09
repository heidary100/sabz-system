# Sabz System Platform
# Domain Model

Version: 1.0

---

# Overview

This document describes the core domain model for the Sabz System Platform. The domain is organized around four primary aggregates: User Management, Product Catalog, Order Management, and Content Management.

---

# Domain Entities

## User Aggregate

```
User
+-- id: UUID
+-- phone: string
+-- passwordHash: string
+-- status: UserStatus (ACTIVE, INACTIVE, SUSPENDED)
+-- createdAt: DateTime
|
+-- Customer (extends User)
|   +-- firstName: string
|   +-- lastName: string
|   +-- addresses: Address[]
|
+-- Partner (extends User)
    +-- companyName: string
    +-- businessType: BusinessType
    +-- verificationStatus: VerificationStatus
    +-- nationalId: string
    +-- tier: PartnerTier
    +-- businessDocuments: BusinessDocument[]

PartnerTier
+-- id: UUID
+-- name: string (Tier 1, Tier 2, Tier 3)
+-- discountPercentage: decimal
+-- minOrderQuantity: int

Address
+-- id: UUID
+-- province: string
+-- city: string
+-- fullAddress: string
+-- postalCode: string
+-- isDefault: boolean
```

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
- **Address**: Structured address with province, city, and postal code

---

# Enumerations

| Enum | Values |
|------|--------|
| UserStatus | ACTIVE, INACTIVE, SUSPENDED |
| VerificationStatus | PENDING, VERIFIED, REJECTED |
| BusinessType | DISTRIBUTOR, WHOLESALER, RETAIL_SHOP, SYSTEM_INTEGRATOR, CORPORATE |
| ProductStatus | DRAFT, PUBLISHED, ARCHIVED |
| StockStatus | IN_STOCK, LOW_STOCK, OUT_OF_STOCK |
| OrderStatus | PENDING, CONFIRMED, PROCESSING, SHIPPED, DELIVERED, CANCELLED, RETURNED |
| PaymentStatus | PENDING, SUCCESS, FAILED, REFUNDED |
| ShippingStatus | PENDING, PICKED_UP, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED |