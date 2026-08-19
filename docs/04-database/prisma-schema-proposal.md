# Sabz System Platform
# Prisma Schema Proposal — Identity Domain

Version: 1.0

---

# Overview

This document proposes the Prisma models for the identity domain. It is **documentation only** and is intended to guide the schema implementation in SS-012 (Implement User Database Schema). It must not be treated as the applied schema.

> **Note (SS-027):** the applied schema no longer contains `UserType`/`userType`. User classification (customer, partner, admin, operator) is expressed exclusively through the `Role`/`UserRole` tables, which are the sole authorization source. The snippets below marked "superseded" are retained for historical reference only.
>
> **Note (SS-038):** the Partner model and the new `BusinessDocument` model below reflect the applied schema: `Partner` owns the onboarding lifecycle with a `DRAFT` default, and `BusinessDocument` stores document metadata (binary contents live outside PostgreSQL).

Target environment:

- Prisma ORM 6.x
- PostgreSQL
- Generator: `prisma-client-js`
- `apps/api/prisma/schema.prisma`

Design decisions are recorded in [Identity Data Model & Database Decisions](identity-data-model.md).

---

# Enums

```prisma
enum UserStatus {
  PENDING_OTP
  ACTIVE
  SUSPENDED
  LOCKED
}

// Superseded by SS-027: user classification is expressed through Role/UserRole.
// enum UserType {
//   CUSTOMER
//   PARTNER
//   ADMIN
//   OPERATOR
// }

enum PartnerApprovalStatus {
  DRAFT
  PENDING
  APPROVED
  REJECTED
}

enum PartnerDocumentType {
  BUSINESS_LICENSE
  NATIONAL_ID
  TAX_REGISTRATION
  SUPPORTING
}
```

---

# Models

## User

Identity root entity. Contains authentication identity only.

```prisma
model User {
  id           String     @id @default(uuid())
  mobile       String     @unique
  email        String?    @unique
  passwordHash String?
  status       UserStatus @default(PENDING_OTP)
  lastLoginAt  DateTime?

  profile  UserProfile?
  roles    UserRole[]
  sessions UserSession[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?
  createdBy String?
  updatedBy String?

  @@index([status])
}
```

## UserProfile

One-to-one profile extension. Holds common profile fields. User classification is expressed through roles, not the profile (SS-027).

```prisma
model UserProfile {
  id        String   @id @default(uuid())
  userId    String   @unique
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  firstName String
  lastName  String
  avatarUrl String?

  partner Partner?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?
  createdBy String?
  updatedBy String?
}
```

## Partner

Optional business extension of a user's profile for B2B business accounts. **Partner is the application aggregate (SS-038)**: one persistent Partner row exists per profile (`profileId @unique`), and it owns the onboarding lifecycle (`DRAFT → PENDING → APPROVED/REJECTED`, `REJECTED → PENDING`).

```prisma
model Partner {
  id                   String                @id @default(uuid())
  profileId            String                @unique
  profile              UserProfile           @relation(fields: [profileId], references: [id], onDelete: Cascade)
  businessName         String
  businessLicenseNo    String?
  nationalId           String?
  website              String?
  address              String?
  city                 String?
  province             String?
  tierId               String?
  tier                 PartnerTier?          @relation(fields: [tierId], references: [id])
  approvalStatus       PartnerApprovalStatus @default(DRAFT)
  approvedAt           DateTime?
  submittedAt          DateTime?
  rejectedAt           DateTime?
  rejectionReason      String?
  reviewNotes          String?

  documents BusinessDocument[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?
  createdBy String?
  updatedBy String?

  @@index([approvalStatus, submittedAt])
  @@index([tierId])
}
```

## Role

```prisma
model Role {
  id          String   @id @default(uuid())
  name        String   @unique
  description String?

  users       UserRole[]
  permissions RolePermission[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  createdBy String?
  updatedBy String?
}
```

## Permission

```prisma
model Permission {
  id       String @id @default(uuid())
  name     String @unique
  resource String
  action   String

  roles RolePermission[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  createdBy String?
  updatedBy String?
}
```

## UserRole (junction)

Enables many-to-many between users and roles. A user may hold multiple roles (AUTH-005).

```prisma
model UserRole {
  userId     String
  roleId     String
  user       User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  role       Role   @relation(fields: [roleId], references: [id], onDelete: Cascade)
  assignedAt DateTime @default(now())
  assignedBy String?

  @@id([userId, roleId])
  @@index([roleId])
}
```

## RolePermission (junction)

Enables many-to-many between roles and permissions.

```prisma
model RolePermission {
  roleId       String
  permissionId String
  role         Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)
  assignedAt   DateTime   @default(now())

  @@id([roleId, permissionId])
  @@index([permissionId])
}
```

## UserSession

Tracks device sessions for session management and revocation.

```prisma
model UserSession {
  id           String   @id @default(uuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  refreshToken String   @unique
  deviceId     String?
  ipAddress    String?
  expiresAt    DateTime
  revokedAt    DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  createdBy String?
  updatedBy String?

  @@index([userId])
}
```

## PartnerTier

```prisma
model PartnerTier {
  id               String    @id @default(uuid())
  name             String    @unique
  discountPercent  Decimal @db.Decimal(5, 2)
  minOrderQuantity Int

  partners Partner[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  createdBy String?
  updatedBy String?
}
```

## BusinessDocument

Metadata record for a partner business document (SS-038). **Metadata lives in PostgreSQL; the binary file contents are stored outside the database** through the Partner-domain `DocumentStorage` abstraction. The storage key is server-generated and never derived from the user-provided original name.

```prisma
model BusinessDocument {
  id           String              @id @default(uuid())
  partnerId    String
  partner      Partner             @relation(fields: [partnerId], references: [id], onDelete: Cascade)
  type         PartnerDocumentType
  originalName String
  mimeType     String
  sizeBytes    Int
  storageKey   String              @unique

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?
  createdBy String?
  updatedBy String?

  @@index([partnerId, deletedAt])
}
```

> The earlier `PartnerDocument` proposal (with a `verified` flag and a public `fileUrl`) is **obsolete and not revived**. SS-038 replaces it with the metadata/storage-key model above; document verification is future work (SS-040).

---

# Product Catalog Domain (SS-100)

This section documents the applied product catalog schema (SS-100), the EPIC-005
Prisma foundation. It is **documentation only** and reflects the applied
migration `ss_100_product_catalog_foundation`.

Design decisions:

1. **SKU is owned by ProductVariant.** Product has no sellable SKU; `ProductVariant.sku` is unique.
2. **Retail/base price on ProductVariant** (`Decimal(12,2)`). No tier pricing, discounts, or `PricingRule` in EPIC-005.
3. **`ProductVariant.stockQuantity` is an M1 catalog availability snapshot**, not the EPIC-006 inventory system of record.
4. **ProductMedia has its own product-domain storage boundary** (`storageKey` server-generated, unique); the `ProductMediaStorage` provider is SS-105, not the Partner `DocumentStorage`.
5. **Product lifecycle in M1 is `DRAFT → PUBLISHED → ARCHIVED`.** No Pending Review; `HIDDEN` is future.
6. **No tier pricing** in EPIC-005.
7. **`ProductVariant.name` is a display label only**; configurable attributes are deferred to SS-104 (no EAV/`ProductAttribute`/`ProductAttributeValue` in SS-100).
8. **Category uses one required `categoryId` on Product** in M1 (no junction table).
9. **ProductMedia is Product-owned** with an optional `variantId`.

```prisma
enum ProductStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

enum ProductCondition {
  NEW
  OPEN_BOX
  REFURBISHED
  USED
  STOCK_CLEARANCE
}

enum ProductMediaType {
  IMAGE
  VIDEO
}

model Category {
  id         String    @id @default(uuid())
  name       String
  slug       String    @unique
  parentId   String?
  parent     Category? @relation("CategoryTree", fields: [parentId], references: [id], onDelete: SetNull)
  children   Category[] @relation("CategoryTree")
  sortOrder  Int       @default(0)
  isVisible  Boolean   @default(true)
  products   Product[]
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
  deletedAt  DateTime?
  createdBy  String?
  updatedBy  String?
  @@index([parentId])
  @@index([isVisible, deletedAt])
}

model Brand {
  id          String    @id @default(uuid())
  name        String
  slug        String    @unique
  description String?
  logoKey     String?
  isFeatured  Boolean   @default(false)
  products    Product[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?
  createdBy   String?
  updatedBy   String?
}

model Product {
  id               String            @id @default(uuid())
  name             String
  slug             String            @unique
  shortDescription String?
  description      String?
  brandId          String
  brand            Brand             @relation(fields: [brandId], references: [id])
  categoryId       String
  category         Category          @relation(fields: [categoryId], references: [id])
  warranty         String?
  condition        ProductCondition
  status           ProductStatus     @default(DRAFT)
  weightKg         Decimal?          @db.Decimal(8, 3)
  widthCm          Decimal?          @db.Decimal(8, 2)
  heightCm         Decimal?          @db.Decimal(8, 2)
  depthCm          Decimal?          @db.Decimal(8, 2)
  originCountry    String?
  variants         ProductVariant[]
  media            ProductMedia[]
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
  deletedAt        DateTime?
  createdBy        String?
  updatedBy        String?
  @@index([status, deletedAt])
  @@index([categoryId, deletedAt])
  @@index([brandId, deletedAt])
}

model ProductVariant {
  id            String          @id @default(uuid())
  productId     String
  product       Product         @relation(fields: [productId], references: [id], onDelete: Cascade)
  sku           String          @unique
  barcode       String?
  name          String?
  price         Decimal         @db.Decimal(12, 2)
  stockQuantity Int             @default(0)
  media         ProductMedia[]
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt
  deletedAt     DateTime?
  createdBy     String?
  updatedBy     String?
  @@index([productId, deletedAt])
}

model ProductMedia {
  id           String            @id @default(uuid())
  productId    String
  product      Product           @relation(fields: [productId], references: [id], onDelete: Cascade)
  variantId    String?
  variant      ProductVariant?   @relation(fields: [variantId], references: [id], onDelete: SetNull)
  mediaType    ProductMediaType
  originalName String
  mimeType     String
  sizeBytes    Int
  storageKey   String            @unique
  sortOrder    Int               @default(0)
  isPrimary    Boolean           @default(false)
  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt
  deletedAt    DateTime?
  createdBy    String?
  updatedBy    String?
  @@index([productId, deletedAt])
  @@index([productId, sortOrder])
  @@index([variantId])
}
```

---

# Future Authentication Methods

`passwordHash` is nullable. When passwordless OTP login or OAuth (Google/Apple) is introduced, add a `UserAuthMethod` child model:

```prisma
enum AuthProvider {
  PASSWORD
  OTP
  GOOGLE
  APPLE
}

model UserAuthMethod {
  id          String        @id @default(uuid())
  userId      String
  user        User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  provider    AuthProvider
  providerUid String?
  secretHash  String?
  enabled     Boolean       @default(true)
  lastUsedAt  DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  createdBy String?
  updatedBy String?

  @@unique([userId, provider])
  @@index([userId])
}
```

---

# Implementation Notes

- Apply as a Prisma migration (e.g., `create-identity-domain`) in SS-012.
- UUID primary keys via `@default(uuid())`.
- Junction tables use composite primary keys and cascade deletes.
- Unique constraints: `User.mobile`, `User.email`, `Role.name`, `Permission.name`, `UserSession.refreshToken`, `Partner.profileId`, `BusinessDocument.storageKey`.
- Indexes cover the status, role, permission, session, and partner filtering paths defined in the Database Design Specification §6, including the partner composite indexes `[approvalStatus, submittedAt]` and `[partnerId, deletedAt]` (SS-038).
- Referential actions: cascade for junction and child records; no cascade on business-critical relations.
- The `UserType` enum and `UserProfile.userType` column were removed in SS-027; the Role/UserRole tables are the only authorization source.
