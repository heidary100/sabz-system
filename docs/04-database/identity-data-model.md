# Sabz System Platform
# Identity Data Model & Database Decisions

Version: 1.0

---

# Overview

This document records the database design decisions for the identity foundation. It is the decision source for implementing the identity schema (SS-012) and supports B2C customers, B2B partners, admin users, and operators.

Related documents:

- [Database Design Specification](database-design-specification.md) — global conventions (soft delete, audit fields, constraints)
- [Entity Relationship Model](entity-relationship-model.md) — identity ERD
- [Domain Model](../06-uml/domain-model.md) — identity domain UML
- [User Lifecycle](user-lifecycle.md) — account state transitions
- [Prisma Schema Proposal](prisma-schema-proposal.md) — target Prisma models

---

# 1. Decision: User Is the Identity Root Entity

Every authenticated person in the platform — customer, partner, admin, operator — is represented by a single **User** entity.

The User table stores only authentication identity:

- `mobile` (unique)
- `email` (unique, optional)
- `password_hash` (nullable)
- `status`
- `last_login_at`

Profile data is not stored on User. It belongs to the one-to-one `UserProfile` extension.

## Rationale

- One identity, many profile types. A user can transition between profile types (customer → partner) and hold multiple roles without changing identity records.
- Authentication logic depends only on the identity table and is independent of profile concerns.
- Simpler authorization: every actor is a User with roles.

---

# 2. Decision: Customer and Partner Are Profile Extensions

- **UserProfile** (one-to-one with User) holds common profile fields (`first_name`, `last_name`, `avatar_url`) and a `user_type` discriminator: `CUSTOMER`, `PARTNER`, `ADMIN`, `OPERATOR`.
- **Customer** is a profile type only; no dedicated table is required in Milestone 1.
- **Partner** is an optional one-to-one extension of UserProfile for B2B business data (`business_name`, `business_license_number`, `national_id`, `tier`, `approval_status`, `approved_at`).

## Rationale

- Avoids table-per-type inheritance, which complicates joins and authorization.
- A partner account starts as a standard customer profile and gains the Partner extension after approval (AUTH-003).
- Admins and operators are Users with the ADMIN/OPERATOR profile type and administrative roles.

---

# 3. Decision: Mobile Number Is the Unique Identity

- Registration uses a valid, unique Iranian mobile number (AUTH-001).
- `mobile` has a unique constraint and is indexed.
- `email` is optional but unique when provided.

## Rationale

- The mobile number is the primary identifier for account recovery, OTP delivery, and login.
- Uniqueness must be enforced at the database level, not only in application validation.

---

# 4. Decision: Soft Delete Supported

Business entities support soft deletion using a nullable `deleted_at` timestamp, per the Database Design Specification.

- Soft-deleted records are excluded from application queries.
- Unique constraints remain active for soft-deleted rows; a mobile number cannot be re-registered while its prior record is soft-deleted without an explicit restoration or permanent cleanup step.

## Rationale

- Regulatory and audit requirements to retain identity history.
- Protects referential integrity for orders, sessions, and audit trails.
- Recovery path without data loss.

---

# 5. Decision: Audit Fields Required

Every identity entity includes the standard audit fields:

- `id`
- `created_at`
- `updated_at`
- `deleted_at` (nullable)
- `created_by` (nullable)
- `updated_by` (nullable)

Junction tables add `assigned_at` and `assigned_by` where meaningful. Audit events (registration, login, role assignment, suspension) are recorded separately in the Audit Log (see Authentication Specification §12).

---

# 6. Decision: Roles and Permissions Are Many-to-Many

- Users ↔ Roles: many-to-many through the `UserRole` junction, enabling multiple simultaneous roles (AUTH-005).
- Roles ↔ Permissions: many-to-many through the `RolePermission` junction.

## Rationale

- A user may be both Customer and Partner simultaneously (AUTH-005).
- RBAC grants are derived from the union of all permissions of all assigned roles.
- Administrative roles are assigned only by Super Administrators (AUTH-006).

---

# 7. Decision: Account Status Is an Enumeration

User status is a database enum:

- `PENDING_OTP`
- `ACTIVE`
- `SUSPENDED`
- `LOCKED`

See [User Lifecycle](user-lifecycle.md) for the full state model and transitions.

---

# 8. Decision: Future Authentication Methods Are Supported

- `password_hash` is nullable on User.
- The current authentication method is password-based; OTP is a verification step, not a stored credential.
- Future methods (passwordless OTP login, Google/Apple OAuth) will be added through a `UserAuthMethod` child table:

```
UserAuthMethod
+-- id
+-- user_id
+-- provider (PASSWORD, OTP, GOOGLE, APPLE)
+-- provider_uid (nullable)
+-- secret_hash (nullable)
+-- enabled
+-- last_used_at
+-- created_at
+-- updated_at
```

## Rationale

- The Authentication Specification lists passwordless OTP and OAuth as future support.
- Keeping `password_hash` nullable now allows migration to the child table without a breaking change.
- A user can later hold multiple auth methods concurrently without altering the identity table.

---

# 9. Decision: Sessions Are Explicitly Modeled

`UserSession` records each device session:

- refresh token hash (unique)
- device identifier
- IP address
- expiry
- revocation

## Rationale

- The Authentication Specification requires concurrent devices, individual revocation, and revoke-all sessions.
- Only a SHA-256 hash of the refresh token is stored in the `refresh_token` column. The raw token is never persisted, so a database leak does not expose usable refresh tokens.
- Refresh-token rotation updates the hash on the existing session row; the previously issued token no longer matches and becomes invalid.

---

# 10. Data Integrity

The identity schema enforces:

- Foreign key constraints on all relations.
- Unique constraints on `mobile`, `email` (when set), role name, permission name, and refresh token.
- Composite primary keys on junction tables.
- Cascade deletes on junction table references; restricted deletes on business-critical identity records.
- Soft deletion for all business entities.

---

# 11. Related Documents

- [Prisma Schema Proposal](prisma-schema-proposal.md)
- [User Lifecycle](user-lifecycle.md)
- [Entity Relationship Model](entity-relationship-model.md)
- [Database Design Specification](database-design-specification.md)
