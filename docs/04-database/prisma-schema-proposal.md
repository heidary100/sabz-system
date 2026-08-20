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

# Inventory Domain (SS-109)

This section documents the applied EPIC-006 inventory foundation (SS-109). It is
**documentation only** and reflects the applied migration
`ss_109_inventory_foundation`.

Design decisions:

1. **`InventoryItem` is authoritative** — one row per `(variantId, warehouseId)`
   (composite unique). `ProductVariant.stockQuantity` is retained as a
   denormalized M1 aggregate and is refreshed in the same transaction as future
   inventory mutations (single write path, owned by the inventory module from
   SS-111 onward). `stockQuantity` is **not** removed in SS-109.
2. **Available = quantityOnHand − quantityReserved** (derived, never stored).
3. **`InventoryMovement` is an immutable append-only ledger** — no
   `updatedAt`/`updatedBy`/`deletedAt`. It stores before/after balance snapshots
   and a signed on-hand delta. `variantId`/`warehouseId` are denormalized
   snapshots (not FKs); `reference` is internal linkage and is never exposed.
4. **`InventoryMovementType` declares forward members** (`SALE`,
   `RETURN_RECEIVED`, `RETURN_REJECTED`, `STOCK_TRANSFER`, `HOLO_IMPORT`) for
   future workflows; only M1 types (`INITIAL_STOCK`, `PURCHASE_RECEIPT`,
   `MANUAL_ADJUSTMENT`, `DAMAGE`, `RESERVATION`, `RESERVATION_RELEASE`) are
   actively produced in M1.
5. **FKs use `ON DELETE RESTRICT`** so inventory rows are never silently
   destroyed (warehouse, variant, inventoryItem).
6. **Reservation** schema is applied for M1 (ACTIVE → RELEASED | CONSUMED |
   EXPIRED); no order models are added.
7. **Default warehouse** (`code = 'DEFAULT'`) is infrastructure reference data,
   ensured idempotently by `apps/api/prisma/bootstrap.ts` (also invoked by
   `prisma:seed` for dev). Existing `stockQuantity` values are backfilled into
   it exactly once, idempotently; soft-deleted variants and variants under
   archived/deleted products are excluded.
8. **No inventory API or UI** exists in SS-109.

```prisma
enum WarehouseStatus {
  ACTIVE
  INACTIVE
}

enum InventoryMovementType {
  INITIAL_STOCK
  PURCHASE_RECEIPT
  SALE
  RESERVATION
  RESERVATION_RELEASE
  MANUAL_ADJUSTMENT
  DAMAGE
  RETURN_RECEIVED
  RETURN_REJECTED
  STOCK_TRANSFER
  HOLO_IMPORT
}

enum ReservationStatus {
  ACTIVE
  RELEASED
  CONSUMED
  EXPIRED
}

model Warehouse {
  id           String          @id @default(uuid())
  code         String          @unique
  name         String
  address      String?
  contactName  String?
  contactPhone String?
  status       WarehouseStatus @default(ACTIVE)

  inventoryItems InventoryItem[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?
  createdBy String?
  updatedBy String?

  @@index([status, deletedAt])
}

model InventoryItem {
  id               String         @id @default(uuid())
  warehouseId      String
  warehouse        Warehouse      @relation(fields: [warehouseId], references: [id], onDelete: Restrict)
  variantId        String
  variant          ProductVariant @relation(fields: [variantId], references: [id], onDelete: Restrict)
  quantityOnHand   Int            @default(0)
  quantityReserved Int            @default(0)
  reorderLevel     Int?
  criticalLevel    Int?

  movements   InventoryMovement[]
  reservations Reservation[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  createdBy String?
  updatedBy String?

  @@unique([variantId, warehouseId])
  @@index([warehouseId])
}

model InventoryMovement {
  id              String               @id @default(uuid())
  inventoryItemId String
  inventoryItem   InventoryItem        @relation(fields: [inventoryItemId], references: [id], onDelete: Restrict)
  variantId       String
  warehouseId     String
  type            InventoryMovementType
  quantity        Int
  reservedDelta   Int                  @default(0)
  reason          String?
  notes           String?
  reference       String?
  onHandBefore    Int
  onHandAfter     Int
  reservedBefore  Int                  @default(0)
  reservedAfter   Int                  @default(0)
  createdAt       DateTime             @default(now())
  createdBy       String?

  @@index([inventoryItemId, createdAt])
  @@index([variantId, createdAt])
  @@index([warehouseId, createdAt])
  @@index([type, createdAt])
  @@index([createdAt])
}

model Reservation {
  id              String            @id @default(uuid())
  inventoryItemId String
  inventoryItem   InventoryItem     @relation(fields: [inventoryItemId], references: [id], onDelete: Restrict)
  quantity        Int
  status          ReservationStatus @default(ACTIVE)
  expiresAt       DateTime?
  releasedAt      DateTime?
  consumedAt      DateTime?
  expiredAt       DateTime?
  createdAt       DateTime          @default(now())
  createdBy       String?
  updatedBy       String?

  @@index([inventoryItemId])
  @@index([status, expiresAt])
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
