# Sabz System Platform
# Prisma Schema Proposal — Identity Domain

Version: 1.0

---

# Overview

This document proposes the Prisma models for the identity domain. It is **documentation only** and is intended to guide the schema implementation in SS-012 (Implement User Database Schema). It must not be treated as the applied schema.

> **Note (SS-027):** the applied schema no longer contains `UserType`/`userType`. User classification (customer, partner, admin, operator) is expressed exclusively through the `Role`/`UserRole` tables, which are the sole authorization source. The snippets below marked "superseded" are retained for historical reference only.

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
  PENDING
  APPROVED
  REJECTED
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

Optional business extension of a user's profile for B2B business accounts. A user becomes a partner after approval, which grants the PARTNER role (SS-027).

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
  approvalStatus       PartnerApprovalStatus @default(PENDING)
  approvedAt           DateTime?

  documents PartnerDocument[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?
  createdBy String?
  updatedBy String?

  @@index([approvalStatus])
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

## PartnerDocument

```prisma
model PartnerDocument {
  id        String   @id @default(uuid())
  partnerId String
  partner   Partner  @relation(fields: [partnerId], references: [id], onDelete: Cascade)
  type      String
  fileUrl   String
  verified  Boolean  @default(false)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  createdBy String?
  updatedBy String?
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
- Unique constraints: `User.mobile`, `User.email`, `Role.name`, `Permission.name`, `UserSession.refreshToken`, `Partner.profileId`.
- Indexes cover the status, role, permission, session, and partner filtering paths defined in the Database Design Specification §6.
- Referential actions: cascade for junction and child records; no cascade on business-critical relations.
- The `UserType` enum and `UserProfile.userType` column were removed in SS-027; the Role/UserRole tables are the only authorization source.
