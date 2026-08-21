# Sabz System Platform
# API Specification

Version: 1.0

---

# 1. Purpose

This document defines the REST API for the Sabz System Platform.

The API follows RESTful principles and serves the Web Storefront, Administration Panel, and future Mobile Applications.

---

# 2. API Standards

Base URL

/api/v1

Response Format

JSON

Authentication

JWT Access Token

Authorization

Role-Based Access Control (RBAC)

Content Type

application/json

File Uploads

multipart/form-data

Date Format

ISO 8601 (UTC)

---

# 3. Standard Response Format

Successful responses return the endpoint's JSON body directly; there is no response envelope.

Errors use the standard error payload:

```json
{
  "statusCode": 400,
  "message": "Invalid OTP code.",
  "error": "Bad Request"
}
```

- `statusCode` — the HTTP status code.
- `message` — a human-readable description, or an array of messages for validation errors.
- `error` — the HTTP error name; may be omitted for some framework-level errors (e.g. a bare `401 Unauthorized`).

Validation Error

```json
{
  "statusCode": 400,
  "message": [
    "mobile must be a valid Iranian mobile number"
  ],
  "error": "Bad Request"
}
```

---

# 4. Authentication API

The authentication flow is OTP-first; see [Authentication API](authentication-api.md) for full request/response details.

POST /auth/request-otp

Generates an OTP for a mobile number.

POST /auth/verify-otp

Verifies the OTP, activates the number, and issues a token pair.

POST /auth/refresh

Issues a new token pair.

POST /auth/logout

Terminates the current session.

GET /auth/me

Returns the authenticated user with their roles.

GET /auth/profile

Returns the authenticated user's profile.

PATCH /auth/profile

Updates the authenticated user's profile.

The following endpoints are planned but not yet implemented:

POST /auth/register

Registers a new retail customer.

POST /auth/login

Authenticates a user.

POST /auth/forgot-password

Initiates password reset.

POST /auth/reset-password

Completes password reset.

---

# 5. Partner API

> **Implemented (SS-039):** the applicant-facing partner onboarding API below.
> All partner routes require a JWT access token and resolve ownership exclusively
> from the authenticated user — never from client-supplied ownership identifiers.
> Non-owned resources return `404 Not Found` rather than `403` to avoid
> disclosing their existence.
>
> **Implemented (SS-040):** the operator/admin review API (list, detail,
> approve, reject, tier change, document preview) is documented in the
> [Admin Partner Review API](#51-admin-partner-review-api-ss-040) section.

POST /partners/apply

Creates the authenticated user's Partner application.

- Requires a complete `UserProfile` (first and last name set); otherwise `400`.
- Creates the application in `DRAFT`. If the request sets `submit: true`, the
  application is validated for submission first; a business license document is
  required, so a fresh application without one returns `422`.
- Returns `409` if an application already exists for the user's profile.
- Status codes: `201`, `400`, `401`, `409`, `422`.

GET /partners/application

Returns the authenticated user's current application, including status,
lifecycle timestamps, rejection reason (where present), tier (once approved),
and active document metadata. Returns `404` when no application exists.
The response never includes storage keys, internal file paths, reviewer notes,
or audit internals. Business documents can be retrieved and replaced while the
application is editable.

PATCH /partners/application

Updates the application before approval:

- Business fields are editable only while the status is `DRAFT` or `REJECTED`.
- `submit: true` transitions `DRAFT`/`REJECTED` → `PENDING` (resubmission),
  clearing `rejectedAt` and `rejectionReason`.
- `PENDING`/`APPROVED` applications are locked: mutations return `409`.
- Submission requires the mandatory business fields and an active
  `BUSINESS_LICENSE` document; otherwise `422`.
- Clients cannot set the status or any lifecycle/reviewer field directly.
- Status codes: `200`, `400`, `401`, `404`, `409`, `422`.

POST /partners/documents

Uploads a business document (`multipart/form-data` with a `type` field and a
`file` part).

- Document types: `BUSINESS_LICENSE`, `NATIONAL_ID`, `TAX_REGISTRATION`,
  `SUPPORTING`.
- Accepted formats: PDF, PNG, JPG. Maximum 10 MB. The declared MIME type and the
  file's magic bytes are both validated; the declared type must match the
  detected content.
- Storage keys are server-generated (`partners/<partnerId>/<documentId>.<ext>`)
  and never derived from the original filename. Uploading a document of a type
  that already has an active document replaces the old document.
- Uploads are allowed only while the application is `DRAFT` or `REJECTED`;
  otherwise `409`.
- Status codes: `201`, `400`, `401`, `404`, `409`, `422`.

GET /partners/documents

Returns the authenticated user's active documents (metadata only; no storage
keys). Returns `404` when the user has no application.

GET /partners/documents/{id}

Authenticated download of one of the user's own documents. Returns the binary
with the stored MIME type and an attachment disposition. No public URLs are
created. Non-owned documents return `404`.

DELETE /partners/documents/{id}

Removes one of the user's own documents. Allowed only while the application is
`DRAFT` or `REJECTED`; otherwise `409`. The metadata row is soft-deleted and
the binary is removed from storage. Non-owned documents return `404`.

GET /partners/status

Planned — application status is returned by `GET /partners/application`.

GET /partners/tier

Tier information is returned on the application once approved; a dedicated
endpoint is not yet implemented.

GET /partners/pricing

Planned (SS-040) — partner-specific pricing information.

---

# 5.1. Admin Partner Review API (SS-040)

All routes require a JWT access token **and** either the `OPERATOR` or `ADMIN`
role (`@Roles(OPERATOR, ADMIN)`). There is no `SUPER_ADMIN` role; `ADMIN` is the
implemented application role. Authorization comes from the database role tables
at request time, never from client-supplied identifiers.

GET /admin/partners

Returns a paginated list of partner applications, defaulting to `PENDING`.

- Query parameters: `status` (one of `DRAFT`, `PENDING`, `APPROVED`, `REJECTED`;
  default `PENDING`), `page` (≥ 1, default 1), `limit` (1–100, default 20).
- Response: `{ items: [...], total, page, limit }`. Ordering is deterministic:
  `submittedAt DESC` (nulls last), then `id DESC`. Soft-deleted partners are
  always excluded.
- Status codes: `200`, `400`, `401`, `403`.

GET /admin/partners/tiers

Returns the list of partner tiers available for assignment.

- **Added by SS-041** so the admin UI can render tier selection in the approve
  and tier-change flows. There is no per-partner scoping; all tiers are
  returned.
- Response: `[{ id, name, discountPercent, minOrderQuantity }, ...]`, ordered by
  `minOrderQuantity` ascending. `discountPercent` is returned as a string.
- Status codes: `200`, `401`, `403`.

GET /admin/partners/{id}

Returns the full review detail for one partner:

- business information (including `nationalId` and `businessLicenseNo`, which
  operators need for verification), approval status, lifecycle timestamps
  (`submittedAt`, `approvedAt`, `rejectedAt`), `rejectionReason`, `reviewNotes`
  (admin-only; never shown to the applicant), the assigned tier, active
  document metadata, and the applicant's profile summary (`firstName`,
  `lastName`, `mobile`).
- The response never includes storage keys, filesystem paths, raw file content,
  audit internals, or secrets.
- Status codes: `200`, `401`, `403`, `404`.

PATCH /admin/partners/{id}/approve

Approves a `PENDING` partner application and activates the `PARTNER` role.

- Body: `{ "tierId": "<uuid>", "reviewNotes": "<optional>" }`.
- Prerequisites: the partner exists and is not deleted; the partner is
  `PENDING`; an active `BUSINESS_LICENSE` document exists (otherwise `422`); the
  tier exists (otherwise `400`).
- The approval transition, `PARTNER` role activation, and the
  `PARTNER_APPROVED` audit entry are committed in a single database
  transaction. The role is assigned to the **applicant's** user; the reviewer is
  recorded as `assignedBy` and as the audit actor.
- Concurrent or repeated decisions on the same partner return `409`; the loser
  of a concurrent approve/reject race receives `409`.
- Status codes: `200`, `400`, `401`, `403`, `404`, `409`, `422`.

PATCH /admin/partners/{id}/reject

Rejects a `PENDING` partner application.

- Body: `{ "reason": "<required>", "reviewNotes": "<optional>" }`.
- Transitions `PENDING → REJECTED`, sets `rejectedAt`, `rejectionReason`, and
  `reviewNotes` when supplied. The tier is not modified. The `PARTNER_REJECTED`
  audit event is written in the same transaction.
- Status codes: `200`, `400`, `401`, `403`, `404`, `409`.

PATCH /admin/partners/{id}/tier

Changes the tier of an `APPROVED` partner.

- Body: `{ "tierId": "<uuid>" }`.
- Only allowed for `APPROVED` partners; `DRAFT`, `PENDING`, and `REJECTED`
  return `409`. The `PARTNER_TIER_CHANGED` audit event records the previous and
  new tier identifiers.
- Status codes: `200`, `400`, `401`, `403`, `404`, `409`.

GET /admin/partners/{id}/documents/{documentId}

Authenticated operator/admin preview or download of a partner business
document.

- The document must belong to the specified partner and must be active (not
  soft-deleted); otherwise `404`. Documents of other partners are never
  disclosed.
- Returns the binary with the stored MIME type and a safe RFC 6266 attachment
  disposition. No public URLs are created; storage keys are never exposed.
- Status codes: `200`, `401`, `403`, `404`.

Audit events written by this API:

| Event | before | after |
| --- | --- | --- |
| `PARTNER_APPROVED` | `{ approvalStatus, tierId }` | `{ approvalStatus, tierId, approvedAt }` |
| `PARTNER_REJECTED` | `{ approvalStatus }` | `{ approvalStatus, rejectedAt, rejectionReason }` |
| `PARTNER_TIER_CHANGED` | `{ tierId }` | `{ tierId }` |

Audit payloads never contain `nationalId`, `businessLicenseNo`, document
contents, raw storage keys/paths, or secrets.

---

# 5.2. Admin User Read API (SS-061)

All routes require a JWT access token **and** either the `OPERATOR` or `ADMIN`
role (`@Roles(OPERATOR, ADMIN)`). There is no `SUPER_ADMIN` role; `ADMIN` is the
implemented application role. Authorization comes from the database role tables
at request time, never from client-supplied identifiers.

This API is strictly read-only: it performs no user mutations, no session
management, and writes no audit events.

GET /admin/users

Returns a paginated list of users.

- Query parameters (all optional):
  - `page` — page number, integer ≥ 1, default 1.
  - `limit` — page size, integer 1–100, default 20.
  - `search` — free-text search, maximum 32 characters (trimmed). Matches
    **OR** semantics (case-insensitive substring) against `User.mobile`,
    `UserProfile.firstName`, and `UserProfile.lastName`.
  - `status` — one of `PENDING_OTP`, `ACTIVE`, `SUSPENDED`, `LOCKED`.
  - `role` — one of `CUSTOMER`, `PARTNER`, `OPERATOR`, `ADMIN`; resolves against
    `Role.name` through the `UserRole` relation.
- All filters combine with AND; the search fields combine with OR.
- Soft-deleted users (`deletedAt` set) are always excluded.
- Ordering is deterministic: `createdAt DESC`, then `id DESC`.
- Response: `{ items: [...], total, page, limit }`, where each item is a
  summary with `id`, `mobile`, `status`, `profile` (`firstName`, `lastName`),
  `roles` (array of role names), `partner` summary (`id`, `businessName`,
  `approvalStatus`) when present, `createdAt`, and `updatedAt`.
- Unknown query parameters are ignored (whitelist validation).
- Status codes: `200`, `400`, `401`, `403`.

GET /admin/users/{id}

Returns the detail for one user.

- `id` must be a valid UUID; otherwise `404`.
- Response includes `id`, `mobile`, `email` (nullable), `status`, `profile`
  (`firstName`, `lastName`), `roles` (each with `name` and `assignedAt`),
  `partner` summary when present, `lastLoginAt` (nullable), `createdAt`, and
  `updatedAt`.
- Soft-deleted or nonexistent users return `404`.
- Responses never include `passwordHash`, refresh tokens, session records,
  session identifiers, audit records, or secrets.
- Status codes: `200`, `401`, `403`, `404`.

---

# 5.3. Admin User Lifecycle API (SS-062)

All routes require a JWT access token and use the same authorization source as
the [Admin User Read API](#52-admin-user-read-api-ss-061): roles are resolved
from the database role tables at request time. `suspend` and `unsuspend` allow
`OPERATOR` and `ADMIN`; `unlock` is `ADMIN` only. `CUSTOMER` and `PARTNER`
receive `403`.

Each mutation is committed in a single database transaction together with its
audit event; if the audit write fails the status (and, for suspension, the
session revocation) rolls back. Lifecycle endpoints never return or write
`passwordHash`, refresh tokens, token hashes, OTP data, session contents, or
secrets.

The supported transitions are:

- `ACTIVE → SUSPENDED` (suspend)
- `SUSPENDED → ACTIVE` (unsuspend)
- `LOCKED → ACTIVE` (unlock)

There is no administrative `ACTIVE → LOCKED` transition, no direct
`PENDING_OTP → ACTIVE` activation, and no account deletion. A `PENDING_OTP`,
`SUSPENDED`, or `LOCKED` target for a transition that does not start from that
status returns `409 Conflict`.

PATCH /admin/users/{id}/suspend

- Body: `{ "reason"?: string }` (optional, trimmed, maximum 500 characters).
- Requires the target to exist and not be soft-deleted (`404` otherwise) and to
  be `ACTIVE` (`409` otherwise).
- Self-suspension is forbidden (`409`).
- An `OPERATOR` may not suspend an account holding the `ADMIN` role (`403`);
  only `ADMIN` may act on `ADMIN` accounts.
- The system must never reach a state with zero active `ADMIN` users: the last
  active `ADMIN` cannot be suspended (`409`). The check runs inside the
  transaction and is concurrency-safe.
- All non-revoked sessions of the target are revoked in the same transaction.
  Access tokens are not individually invalidated; they expire within 15 minutes
  and the JWT strategy rejects any non-`ACTIVE` user, so a suspended account
  cannot use existing sessions afterwards.
- Writes the `USER_SUSPENDED` audit event.
- Status codes: `200`, `400`, `401`, `403`, `404`, `409`.

PATCH /admin/users/{id}/unsuspend

- No body.
- Requires the target to exist, not be soft-deleted (`404`), and be `SUSPENDED`
  (`409` otherwise).
- An `OPERATOR` may not act on an `ADMIN`-role account (`403`).
- Old sessions are **not** restored; the user authenticates again.
- Writes the `USER_UNSUSPENDED` audit event.
- Status codes: `200`, `401`, `403`, `404`, `409`.

PATCH /admin/users/{id}/unlock

- No body. `ADMIN` only (`OPERATOR` → `403`).
- Requires the target to exist, not be soft-deleted (`404`), and be `LOCKED`
  (`409` otherwise).
- Sessions remain revoked; the user authenticates again.
- Writes the `USER_UNLOCKED` audit event.
- Status codes: `200`, `401`, `403`, `404`, `409`.

Audit events written by this API:

| Event | before | after |
| --- | --- | --- |
| `USER_SUSPENDED` | `{ status }` | `{ status, reason? }` |
| `USER_UNSUSPENDED` | `{ status }` | `{ status }` |
| `USER_UNLOCKED` | `{ status }` | `{ status }` |

The audit `userId` is the operator/admin performing the mutation; `entity` is
`User` and `entityId` is the target user id. The request IP is recorded when
available. Audit payloads never contain secrets or tokens.

---

# 5.4. Admin Role Administration API (SS-063)

All routes require a JWT access token **and** the `ADMIN` role
(`@Roles(ADMIN)`). `CUSTOMER`, `PARTNER`, and `OPERATOR` receive `403`;
unauthenticated requests receive `401`. There is no `SUPER_ADMIN` role; `ADMIN`
is the implemented application role, and role administration is `ADMIN`-only.

This is the M1 role-administration scope of AUTH-006. It implements the
administrative assignment/removal of roles and a read-only role catalog. It does
**not** implement role creation/deletion, permission creation/assignment, a
permission-management UI, or any privileged hierarchy beyond `ADMIN`; those
AUTH-006 capabilities remain deferred.

Each mutation is committed in a single database transaction together with its
audit event; if the audit write fails the role change rolls back. Role
mutations never return or write `passwordHash`, refresh tokens, token hashes,
session contents, or secrets.

GET /admin/roles

Returns the role catalog (read-only; writes no audit).

- Response: `[{ id, name, description, permissions }, ...]` where `permissions`
  is an array of permission names (read-only; empty when no permissions are
  seeded). Ordering is deterministic by `name` ascending.
- No internal database fields are exposed.
- Status codes: `200`, `401`, `403`.

PUT /admin/users/{id}/roles/{role}

Assigns a role to a user. The role is one of `CUSTOMER`, `PARTNER`, `OPERATOR`,
`ADMIN`.

- `id` must be a valid UUID (`404` otherwise); `role` must be a valid application
  role (`400` otherwise). The target must exist and not be soft-deleted (`404`);
  a valid role with no matching `Role` row also returns `404`.
- Self role modification is forbidden (`403`).
- The assignment is **additive**: existing roles are preserved and only the
  named role is touched. Assigning `CUSTOMER` + `PARTNER` leaves the user with
  both roles.
- The `UserRole` row is written with `UserRole.upsert` on the composite key
  `(userId, roleId)`. Assignment is **idempotent**: repeating an existing
  assignment returns `200` with the unchanged user detail and writes **no**
  duplicate row and **no** audit entry. The upsert is the authoritative
  operation; mutation detection does not rely on a separate existence check.
- Assigning the `ADMIN` role to another user is allowed (an `ADMIN` actor may
  not target themselves). This only increases the active-ADMIN population and
  never weakens the last-active-ADMIN invariant.
- Role assignment is allowed regardless of the target's account status
  (`ACTIVE`, `SUSPENDED`, `LOCKED`, `PENDING_OTP`); a non-`ACTIVE` account
  cannot authenticate, so an assigned role is inert until the account is
  `ACTIVE`. Soft-deleted targets are always `404`.
- Writes the `ROLE_ASSIGNED` audit event.
- Status codes: `200`, `400`, `401`, `403`, `404`.

DELETE /admin/users/{id}/roles/{role}

Removes a role from a user.

- `id` must be a valid UUID (`404` otherwise); `role` must be a valid application
  role (`400` otherwise). The target must exist and not be soft-deleted (`404`);
  a valid role with no matching `Role` row also returns `404`.
- Self role modification is forbidden (`403`).
- The `ADMIN` role **cannot be removed** in M1 (`403`); this policy, together
  with the self-modification restriction and additive-only assignment, ensures
  role mutations can never reduce the active-ADMIN population to zero.
- Removal is **idempotent**: removing an already-absent non-`ADMIN` role returns
  `200` with the unchanged user detail and writes **no** audit entry.
- Removing roles from `SUSPENDED`/`LOCKED` targets is allowed; only soft-deleted
  targets return `404`. A suspended or locked `ADMIN` still holds the `ADMIN`
  role and is not an "active `ADMIN`" for the last-active-ADMIN invariant.
- Writes the `ROLE_REMOVED` audit event.
- Status codes: `200`, `400`, `401`, `403`, `404`.

Audit events written by this API:

| Event | before | after |
| --- | --- | --- |
| `ROLE_ASSIGNED` | `{ role: null }` | `{ role: "OPERATOR" }` |
| `ROLE_REMOVED` | `{ role: "OPERATOR" }` | `{ role: null }` |

The audit `userId` is the `ADMIN` performing the mutation; `entity` is
`UserRole` and `entityId` is the target user id. The request IP is recorded when
available. No audit entry is written for `GET /admin/roles`. Audit payloads
never contain `passwordHash`, refresh tokens, token hashes, session contents,
complete user records, or secrets.

---

# 5.5. Admin Audit Query API (SS-064)

A read-only query API over the shared audit log. All routes require a JWT access
token **and** either the `OPERATOR` or `ADMIN` role (`@Roles(OPERATOR, ADMIN)`);
`CUSTOMER` and `PARTNER` receive `403`, unauthenticated requests receive `401`.
The endpoint is strictly read-only: it performs no mutations and writes **no**
audit events for querying.

GET /admin/audit

Returns a paginated, deterministically ordered audit log.

- Query parameters (all optional):
  - `page` — page number, integer ≥ 1, default 1.
  - `limit` — page size, integer 1–100, default 20.
  - `actorId` — exact `AuditLog.userId` match; must be a valid UUID.
  - `action` — exact audit action match (e.g. `USER_SUSPENDED`,
    `PARTNER_TIER_CHANGED`); trimmed, maximum 64 characters.
  - `entity` — exact audit entity match (e.g. `User`, `Partner`,
    `UserRole`); trimmed, maximum 64 characters.
  - `entityId` — exact `AuditLog.entityId` match; must be a valid UUID.
  - `from` — inclusive lower bound on `createdAt` (ISO 8601 UTC).
  - `to` — inclusive upper bound on `createdAt` (ISO 8601 UTC).
- All filters combine with AND. `action`/`entity` are exact-match filters; there
  is no partial matching. `from`/`to` are inclusive on both ends; a date-only
  input such as `2026-08-18` means `2026-08-18T00:00:00.000Z`, so use full
  timestamps for day-boundary queries. `from` later than `to` returns `400`.
- Ordering is deterministic: `createdAt DESC`, then `id DESC`.
- Response: `{ items: [...], total, page, limit }`. Each item is:
  `id`, `userId` (the raw stored actor id, nullable), `actor` (resolved actor
  object or `null`), `action`, `entity`, `entityId` (nullable), `before` /
  `after` (nullable opaque payload objects), `ipAddress` (nullable), and
  `createdAt` (ISO 8601 UTC).
- Actor resolution: `actor` contains `id`, `mobile`, `firstName`, `lastName`.
  Because `AuditLog` intentionally has no foreign key to `User`, the actor may
  no longer exist: the row is still returned, `userId` preserves the raw value,
  and `actor` is `null`. Soft-deleted actors resolve normally so attribution is
  retained for the trusted admin viewer. Missing actors never produce `404`.
- Payload safety: `before`/`after` are returned exactly as stored. Their safety
  is guaranteed at write time — every audit producer excludes OTP codes, tokens
  and token hashes, password hashes, national IDs, business license numbers,
  document storage keys/filesystem paths, and secrets (see the authentication
  feature specification §12 and database design specification §8). Responses
  never include authentication internals such as `passwordHash`, refresh
  tokens, session contents, or secrets.
- Unknown query parameters are ignored (whitelist validation).
- Status codes: `200`, `400`, `401`, `403`.

---

# 5.6. Admin Dashboard API (SS-065)

A read-only operational dashboard snapshot of already-implemented domains.
All routes require a JWT access token **and** either the `OPERATOR` or `ADMIN`
role (`@Roles(OPERATOR, ADMIN)`); `CUSTOMER` and `PARTNER` receive `403`,
unauthenticated requests receive `401`. There is no `SUPER_ADMIN` role; `ADMIN`
is the implemented application role. The endpoint is strictly read-only: it
performs no mutations and writes **no** audit events for querying.

This API is deliberately not an analytics subsystem. It exposes counts and
bounded recent lists only; revenue, orders, products, inventory, pricing,
charts, trends, and time-series metrics are out of scope.

GET /admin/dashboard

Returns the operational summary.

- Response:
  ```json
  {
    "users": { "total": 0, "active": 0, "suspended": 0, "locked": 0, "pendingOtp": 0 },
    "roles": { "customer": 0, "partner": 0, "operator": 0, "admin": 0 },
    "partners": { "draft": 0, "pending": 0, "approved": 0, "rejected": 0 },
    "recentPartners": [],
    "recentAudit": []
  }
  ```
- `users` — counts of non-deleted users by `User.status`. The statuses are
  mutually exclusive enum values, so `active + suspended + locked + pendingOtp`
  always equals `total` (the count of all non-deleted users).
- `roles` — counts of **non-deleted users holding each application role**,
  regardless of account status (a role on a non-`ACTIVE` account is an inert
  assignment and is still counted). A user holding multiple roles is counted
  once in each role bucket; within one bucket a user is never double-counted.
  Soft-deleted users are excluded.
- `partners` — counts of non-deleted partners by `Partner.approvalStatus`. The
  lifecycle states are mutually exclusive, so `draft + pending + approved +
  rejected` equals the count of all non-deleted partners.
- `recentPartners` — the **5** most recent partner applications (bounded),
  including all statuses (`DRAFT`, `PENDING`, `APPROVED`, `REJECTED`).
  Ordering is deterministic: `submittedAt DESC` (nulls last, so `DRAFT` rows
  sort after all submitted applications), then `id DESC`. Each item is the
  lightweight partner summary `{ id, businessName, approvalStatus, city,
  province, submittedAt, createdAt }`. Sensitive business identifiers
  (`nationalId`, `businessLicenseNo`), `reviewNotes`, rejection details, tier,
  and document data are never included.
- `recentAudit` — the **8** most recent audit entries (bounded), each a compact
  `{ id, userId, actor, action, entity, entityId, createdAt }`. Ordering is
  deterministic: `createdAt DESC`, then `id DESC`. `actor` resolution follows
  the SS-064 policy: soft-deleted actors resolve normally, and a missing actor
  yields `actor: null` while the raw `userId` is preserved. The `before`/`after`
  payload blobs and `ipAddress` are **not** exposed on the dashboard.
- All dates are ISO 8601 UTC strings; no Jalali conversion is performed by the
  API.
- The aggregate reads run in a single Prisma transaction for a coherent enough
  operational snapshot; SERIALIZABLE isolation is intentionally not used.
- Status codes: `200`, `401`, `403`.

---

# 6. Product API

GET /products

Retrieve paginated product list.

GET /products/{id}

Retrieve product details.

GET /products/{slug}

Retrieve product by SEO slug.

GET /products/search

Search products.

GET /products/featured

Featured products.

GET /products/latest

Newest arrivals.

GET /products/stock

Refurbished/stock products.

GET /products/related

Related products.

---

# 7. Category API

GET /categories

List categories.

GET /categories/tree

Hierarchical category tree.

GET /categories/{slug}

Category details.

GET /categories/{slug}/products

Products within category.

---

# 8. Shopping Cart API

GET /cart

Retrieve cart.

POST /cart/items

Add product.

PATCH /cart/items/{id}

Update quantity.

DELETE /cart/items/{id}

Remove item.

DELETE /cart

Clear cart.

---

# 9. Wishlist API

GET /wishlist

Retrieve wishlist.

POST /wishlist

Add product.

DELETE /wishlist/{id}

Remove product.

---

# 10. Checkout API

POST /checkout

Create order.

GET /checkout/shipping-methods

Available shipping methods.

GET /checkout/payment-methods

Available payment methods.

POST /checkout/validate

Validate order before payment.

---

# 11. Orders API

GET /orders

Customer order history.

GET /orders/{id}

Order details.

POST /orders/{id}/cancel

Cancel eligible order.

POST /orders/{id}/return

Submit return request.

GET /orders/{id}/invoice

Download invoice.

---

# 12. Payment API

POST /payments

Initiate payment.

POST /payments/callback

Payment gateway callback.

GET /payments/{id}

Payment details.

POST /payments/{id}/refund

Issue refund.

---

# 13. Administration API

GET /admin/dashboard

Dashboard metrics. Implemented as the read-only operator/admin operational
snapshot API — see [Admin Dashboard API](#56-admin-dashboard-api-ss-065).

GET /admin/users

Manage users. Implemented as the paginated operator/admin read API — see
[Admin User Read API](#52-admin-user-read-api-ss-061) — plus the account
lifecycle endpoints — see [Admin User Lifecycle API](#53-admin-user-lifecycle-api-ss-062) —
plus the role administration endpoints — see
[Admin Role Administration API](#54-admin-role-administration-api-ss-063).

GET /admin/audit

Query the audit log. Implemented as the read-only operator/admin audit query
API — see [Admin Audit Query API](#55-admin-audit-query-api-ss-064).

GET /admin/partners

Manage partners. Implemented as the paginated operator/admin review API — see
[Admin Partner Review API](#51-admin-partner-review-api-ss-040).

GET /admin/products

Manage catalog.

GET /admin/orders

Manage orders.

GET /admin/payments

Manage payments.

GET /admin/reports

Business reports.

---

# 14. Product Administration

GET /admin/products

Retrieve paginated product list. Query params: `page` (default 1), `limit`
(default 20, max 100), `search` (case-insensitive contains on name/slug),
`status`, `categoryId`, `brandId`. Response is a `PaginatedResult<ProductSummary>`.
Ordering is deterministic: `createdAt DESC`, then `id DESC`. Soft-deleted
products are always excluded.

GET /admin/products/{id}

Retrieve a single `ProductDetail` (includes `brand`, `category`, `variants`
and `media`). Missing, invalid-UUID, or soft-deleted products return 404.
No internal fields (`storageKey`, `logoKey`, `deletedAt`, `createdBy`,
`updatedBy`) are exposed; Decimal fields are serialized as strings.

POST /admin/products

Create a product. Body uses the `CreateProductInput` contract. Every product
starts as `DRAFT` regardless of any submitted `status` (a non-`DRAFT` status is
rejected with 400); publication is an explicit lifecycle action. `slug` is
generated from `name` when omitted. Invalid or soft-deleted `brandId`/
`categoryId` return 404. Duplicate slug returns 409. Audits `PRODUCT_CREATED`.

PATCH /admin/products/{id}

Update product business fields (`name`, `slug`, `shortDescription`,
`description`, `brandId`, `categoryId`, `warranty`, `condition`, weight/
dimensions, `originCountry`). `status` is not editable through PATCH — lifecycle
transitions happen only via the publish/archive endpoints. An archived product
cannot be updated (409). Duplicate slug returns 409. Audits `PRODUCT_UPDATED`
with only the changed business fields.

DELETE /admin/products/{id}

Soft-delete a product (`deletedAt` set; no hard delete; no cascade to variants/
media). Only `ARCHIVED` products may be deleted (other statuses return 409).
Audits `PRODUCT_DELETED`. The response is the last-known product detail.

POST /admin/products/{id}/publish

Transition `DRAFT → PUBLISHED`. Requires at least one non-deleted variant
(otherwise 409). A product that is not `DRAFT` returns 409. Conditional and
race-safe. Audits `PRODUCT_PUBLISHED`.

POST /admin/products/{id}/archive

Transition `PUBLISHED → ARCHIVED`. A product that is not `PUBLISHED` returns
409. Conditional and race-safe. Audits `PRODUCT_ARCHIVED`.

Authorization: all product administration endpoints require `OPERATOR` or
`ADMIN` (`JwtAuthGuard` + `RolesGuard`). There is no SUPER_ADMIN role.

Pricing boundary: `Product` has no price and no SKU; the retail/base price and
the sellable SKU live on `ProductVariant` (created in SS-104). Tier pricing,
discounts and pricing rules are out of scope for SS-102.

Deferred: product media/storage (SS-105), storefront/public product APIs.

## 14.1 Variant & Minimal Inventory Administration (SS-104)

All variant endpoints require `OPERATOR` or `ADMIN` (`JwtAuthGuard` +
`RolesGuard`). There is no SUPER_ADMIN role. Mutations run inside a transaction,
write audit events transactionally, and never expose internal fields
(`deletedAt`, `createdBy`, `updatedBy`, `storageKey`). `price` is a
`Decimal(12,2)` serialized as a string (never a JS number), consistent with
`PartnerTier.discountPercent`.

GET /admin/products/{productId}/variants

List the active (non-soft-deleted) variants of a product as an array of
`VariantSummary` (`id`, `productId`, `sku`, `barcode`, `name`, `price`,
`stockQuantity`). Missing, invalid-UUID, or soft-deleted products return 404.
Ordering is deterministic: `createdAt ASC`, then `id ASC`.

POST /admin/products/{productId}/variants

Create a variant for the product taken from the route param (never from the
body). Body uses `sku` (required, trimmed, max 64), `barcode` (optional, max
64), `name` (optional display label, max 255), `price` (required, positive,
`Decimal(12,2)` as string), `stockQuantity` (optional integer >= 0, default 0).
The owning product must exist, not be soft-deleted (404) and not be `ARCHIVED`
(409). Duplicate `sku` returns 409 (DB unique constraint, race-safe). Audits
`PRODUCT_VARIANT_CREATED`.

GET /admin/variants/{id}

Retrieve a single `VariantSummary`. Missing, invalid-UUID, or soft-deleted
variants return 404. No internal fields are exposed.

PATCH /admin/variants/{id}

Update variant business fields: `sku`, `barcode`, `name`, `price`. `barcode`/
`name` may be `null` to clear. `productId` is not accepted (re-parenting is
forbidden) and inventory fields are not accepted (inventory authority lives in
the inventory endpoint below). `deletedAt`/`createdBy`/`updatedBy` are
server-owned. Duplicate `sku` returns 409. An archived owning product returns
409. The write is conditional on the variant and its owning product still being
active, so a mutation racing a concurrent archive or soft-delete fails cleanly.
Audits `PRODUCT_VARIANT_UPDATED` with only the changed fields (price changes
are captured in the before/after delta).

DELETE /admin/variants/{id}

Soft-delete a variant (`deletedAt` + `updatedBy`; no hard delete). Missing,
invalid-UUID, or soft-deleted variants return 404. A variant may be deleted
regardless of its `stockQuantity`. Deleting the only variant of a published
product does **not** unpublish the product; the publish prerequisite (at least
one active variant) applies only at publish time. Audits
`PRODUCT_VARIANT_DELETED`. The response is the last-known `VariantSummary`.

PATCH /admin/variants/{id}/inventory

Set the absolute `stockQuantity` (the M1 inventory boundary). Body:
`stockQuantity` (required integer >= 0). The write is atomic and conditional on
the variant and its owning product being active (`deletedAt IS NULL` and product
not archived), so it never resurrects a deleted variant, cannot produce a
negative value (validated `>= 0`), and a mutation racing a concurrent archive or
soft-delete fails cleanly. Concurrent absolute sets are last-writer-wins
(acceptable for a manual admin set-stock operation; no delta/movement
semantics). An archived owning product returns 409. Audits
`PRODUCT_INVENTORY_SET` with the integer before/after stock.

Authorization: all variant endpoints require `OPERATOR` or `ADMIN`. There is no
SUPER_ADMIN role. The inventory boundary is EPIC-005: only
`ProductVariant.stockQuantity` is exposed; warehouses, reservations,
movements/history, receiving, returns and reorder belong to EPIC-006.

---

# 15. Category & Brand Administration

Both category and brand administration endpoints require `OPERATOR` or `ADMIN`
(`JwtAuthGuard` + `RolesGuard`). There is no SUPER_ADMIN role. All mutations are
soft-deletes only (no hard delete), write audit events transactionally, and
never expose internal fields (`deletedAt`, `createdBy`, `updatedBy`,
`storageKey`, `logoKey`).

## 15.1 Categories

GET /admin/categories

Retrieve a paginated category list. Query params: `page` (default 1), `limit`
(default 20, max 100). Response is a `PaginatedResult<CategorySummary>` with
fields `id`, `name`, `slug`, `parentId`, `sortOrder`, `isVisible`. Ordering is
deterministic: `sortOrder ASC`, then `name ASC`, then `id ASC`. Soft-deleted
categories are always excluded.

GET /admin/categories/{id}

Retrieve a single `CategoryDetail` (the `CategorySummary` fields plus a
one-level `children: CategorySummary[]` of non-deleted children, ordered by
`sortOrder ASC`, `name ASC`, `id ASC`). Missing, invalid-UUID, or soft-deleted
categories return 404.

POST /admin/categories

Create a category. Body uses the `CreateCategoryInput` contract: `name`
(required, max 255), `slug` (optional; generated from `name` when omitted;
`[a-z0-9]` and hyphens, max 255), `parentId` (optional UUID; `null` or omitted =
root), `sortOrder` (optional, non-negative integer), `isVisible` (optional
boolean). A missing or soft-deleted `parentId` returns 404. Duplicate slug
returns 409. Audits `CATEGORY_CREATED`.

PATCH /admin/categories/{id}

Update category fields (`name`, `slug`, `parentId`, `sortOrder`, `isVisible`).
`parentId: null` moves the category to root. Self-parenting and moves that would
form a cycle (moving a category under one of its descendants) return 409.
Duplicate slug returns 409. Audits `CATEGORY_UPDATED` with only the changed
fields.

DELETE /admin/categories/{id}

Soft-delete a category (`deletedAt` set; no hard delete; no cascade). Deletion
is rejected with 409 when the category has non-deleted children or is referenced
by non-deleted products. Audits `CATEGORY_DELETED` with deletion metadata only.

## 15.2 Brands

GET /admin/brands

Retrieve a paginated brand list. Query params: `page` (default 1), `limit`
(default 20, max 100). Response is a `PaginatedResult<BrandSummary>` with fields
`id`, `name`, `slug`, `description`, `isFeatured`. Ordering is deterministic:
`name ASC`, then `id ASC`. Soft-deleted brands are always excluded.

GET /admin/brands/{id}

Retrieve a single `BrandSummary` (`id`, `name`, `slug`, `description`,
`isFeatured`). Missing, invalid-UUID, or soft-deleted brands return 404. The
internal `logoKey` is never exposed (brand logo/media belongs to SS-105).

POST /admin/brands

Create a brand. Body uses the `CreateBrandInput` contract: `name` (required,
max 255), `slug` (optional; generated from `name` when omitted; `[a-z0-9]` and
hyphens, max 255), `description` (optional, max 1000), `isFeatured` (optional
boolean, default false). Duplicate slug returns 409. `logoKey` is not accepted
(logo belongs to SS-105). Audits `BRAND_CREATED`.

PATCH /admin/brands/{id}

Update brand fields (`name`, `slug`, `description`, `isFeatured`).
`description: null` clears the description. Duplicate slug returns 409. Audits
`BRAND_UPDATED` with only the changed fields.

DELETE /admin/brands/{id}

Soft-delete a brand (`deletedAt` set; no hard delete). Deletion is rejected with
409 when the brand is referenced by non-deleted products. Audits
`BRAND_DELETED` with deletion metadata only.

---

# 16. Pricing Administration

GET /admin/pricing

Pricing rules.

POST /admin/pricing

Create pricing rule.

PATCH /admin/pricing/{id}

Update pricing rule.

DELETE /admin/pricing/{id}

Delete pricing rule.

---

# 17. Inventory Administration

All inventory administration endpoints require `OPERATOR` or `ADMIN`
(`JwtAuthGuard` + `RolesGuard`). There is no SUPER_ADMIN role and no
permission-based RBAC. Reads never expose internal fields (`deletedAt`,
`createdBy`, `updatedBy`) or movement/ledger internals.

## 17.1 Inventory Read API (SS-112)

The SS-112 read API is read-only. It never writes `InventoryItem`,
`InventoryMovement`, `Reservation` or `ProductVariant.stockQuantity`.

**Derived availability:** `available = quantityOnHand − quantityReserved`,
computed server-side at read time. `available` is never stored.

**Derived stock status:** computed per row from `available` against the
configured thresholds:

- `OUT_OF_STOCK` when `available <= 0`
- `LOW_STOCK` when `available <= reorderLevel` (`criticalLevel` is the fallback
  threshold when `reorderLevel` is not configured)
- `IN_STOCK` otherwise

**Operational lifecycle filtering (applies to every read):** soft-deleted
variants, soft-deleted/ARCHIVED products, and soft-deleted or INACTIVE
warehouses are always excluded. `InventoryItem` rows are permanent (no soft
delete). Inactive warehouses never contribute to reads or to the
`stockQuantity` aggregate.

**Response item (`InventoryItemSummary`):** `id`, `variantId`, `warehouseId`,
`quantityOnHand`, `quantityReserved`, `available`, `reorderLevel`,
`criticalLevel`, `stockStatus`, `variant` (`id`, `sku`, `name`), `warehouse`
(`id`, `code`, `name`, `status`).

### GET /admin/inventory

Paginated stock overview. Query parameters:

- `page` — page number, starting at 1 (default 1)
- `limit` — page size, 1–100 (default 20)
- `variantId` — UUID filter for one variant
- `warehouseId` — UUID filter for one warehouse
- `stockStatus` — `IN_STOCK` / `LOW_STOCK` / `OUT_OF_STOCK` (filtered after
  derivation)
- `search` — case-insensitive substring match against variant `sku` OR
  `name` (LIKE wildcards are escaped)

All filters combine with AND. Ordering is deterministic: `createdAt DESC`,
then `id DESC`. Response: `PaginatedResult<InventoryItemSummary>`.

Errors: 400 (invalid query), 401, 403.

### GET /admin/inventory/variants/{variantId}

Return the inventory of one variant across its **active**, non-deleted
warehouses as an array of `InventoryItemSummary`. Ordering is deterministic:
`warehouse.code ASC`, then `id ASC`. Missing, invalid-UUID, soft-deleted, or
ARCHIVED-product variants return 404.

Errors: 401, 403, 404.

### GET /admin/warehouses/{warehouseId}/inventory

Return the paginated inventory of one warehouse. Query parameters: `page`
(default 1), `limit` (default 20, max 100). Ordering is deterministic:
`createdAt DESC`, then `id DESC`. Response:
`PaginatedResult<InventoryItemSummary>`. Missing, invalid-UUID, soft-deleted,
or INACTIVE warehouses return 404.

Errors: 400 (invalid query), 401, 403, 404.

### stockQuantity compatibility

`ProductVariant.stockQuantity` remains the **denormalized aggregate** of
`InventoryItem.quantityOnHand` across active, non-deleted warehouses for
active (non-deleted, non-ARCHIVED) variants/products. The aggregate is computed
by the shared inventory aggregate helper (`InventoryService`), which the
SS-113 mutation API reuses so every EPIC-006 stock mutation refreshes
`stockQuantity` in the same transaction. A variant with no InventoryItem rows
aggregates to `0`. The legacy SS-104 `PATCH /admin/variants/:id/inventory`
endpoint remains available in M1 as the temporary boundary and is repointed
through the inventory write path by SS-113 (deprecated, not removed).

## 17.2 Warehouse Management API (SS-111)

All warehouse administration endpoints require `ADMIN` (`JwtAuthGuard` +
`RolesGuard`); `CUSTOMER`/`PARTNER`/`OPERATOR` are denied with 403 and
unauthenticated requests with 401. There is no SUPER_ADMIN role and no
permission-based RBAC. All mutations are transactional and write a
transactional `AuditLog` event; an audit failure rolls back the mutation.

Warehouses are soft-delete-aware (`deletedAt`): every read and lifecycle
operation excludes soft-deleted warehouses and treats them as not found (404).
There is no hard-delete endpoint and no soft-delete endpoint — deactivation
is the operational lifecycle mechanism. Inventory rows are never destroyed:
the `InventoryItem.warehouse_id` FK is `ON DELETE RESTRICT`.

Responses never expose internal fields (`deletedAt`, `createdBy`,
`updatedBy`) or inventory contents. Warehouse code uniqueness is enforced by
the database; a duplicate `code` returns 409 (race-safe via P2002). Codes are
trimmed and stored as provided (case-sensitive); no slug generation.

### GET /admin/warehouses

List warehouses with pagination. Query parameters:

- `page` — page number, starting at 1 (default 1)
- `limit` — page size, 1–100 (default 20)
- `status` — filter by `ACTIVE` or `INACTIVE`
- `search` — case-insensitive substring match against `name` OR `code`

Always filters `deletedAt IS NULL`. Ordering is deterministic:
`createdAt DESC`, then `id DESC`. Response: `PaginatedResult<WarehouseSummary>`
(`{ items, total, page, limit }`).

Errors: 400 (invalid query), 401, 403.

### GET /admin/warehouses/{id}

Return a single `WarehouseDetail`. Missing, invalid-UUID, or soft-deleted
warehouses return 404.

Errors: 401, 403, 404.

### POST /admin/warehouses

Create a warehouse. Body: `code` (required, unique, max 100), `name`
(required, max 255), `address` (optional, max 1000), `contactName` (optional,
max 255), `contactPhone` (optional, max 100). New warehouses are created with
status `ACTIVE`. Response: 201 `WarehouseDetail`.

Errors: 400 (invalid body), 401, 403, 409 (duplicate `code`).

### PATCH /admin/warehouses/{id}

Update mutable fields: `code`, `name`, `address`, `contactName`,
`contactPhone`. Passing `null` for `address`/`contactName`/`contactPhone`
clears the field. Status cannot be changed here — use the dedicated lifecycle
endpoints. The write is a conditional `updateMany` on
`id + deletedAt IS NULL`, so a mutation racing a concurrent soft-delete fails
cleanly and a soft-deleted warehouse is never resurrected. Response: 200
`WarehouseDetail`.

Errors: 400 (invalid body), 401, 403, 404 (missing/soft-deleted), 409
(duplicate `code`).

### POST /admin/warehouses/{id}/deactivate

Transition an `ACTIVE` warehouse to `INACTIVE`. Guards (all enforced inside
the transaction):

- missing / soft-deleted → 404
- already `INACTIVE` → 409
- the last active warehouse (the platform must never have zero active,
  non-deleted warehouses) → 409

Race safety: the active warehouse rows are locked (`SELECT ... FOR UPDATE`)
before the conditional transition, so concurrent deactivations of two
different warehouses cannot both commit and zero out the active count — the
loser re-reads the committed active set and fails with 409. Transient
interactive-transaction errors (a blocked transaction timing out under lock
contention) are retried a bounded number of times so the loser returns 409
rather than a 5xx. Response: 200 `WarehouseDetail`.

Errors: 401, 403, 404, 409.

### POST /admin/warehouses/{id}/activate

Transition an `INACTIVE` warehouse to `ACTIVE`. Guards: missing /
soft-deleted → 404; already `ACTIVE` → 409. The transition is a conditional
`updateMany` on `id + status = INACTIVE + deletedAt IS NULL`, so a concurrent
transition wins and the loser fails with 409. Activation can never reduce the
active count, so no active-set lock is required. Response: 200
`WarehouseDetail`.

Errors: 401, 403, 404, 409.

### Audit events

- `WAREHOUSE_CREATED` — `before: null`, `after: { code, name, status,
  address?, contactName?, contactPhone? }`
- `WAREHOUSE_UPDATED` — `before`/`after` = changed business fields only
- `WAREHOUSE_DEACTIVATED` — `before: { status: "ACTIVE" }`,
  `after: { status: "INACTIVE" }`
- `WAREHOUSE_ACTIVATED` — `before: { status: "INACTIVE" }`,
  `after: { status: "ACTIVE" }`

All events use `entity = "Warehouse"`, `entityId = warehouse.id`, the actor's
`userId`, and the request `ipAddress`. Payloads never include `deletedAt`,
`createdBy`, `updatedBy`, raw Prisma records, inventory contents, storage
paths, or secrets.

### Out of scope

Inventory stock operations, receive/adjust, reservations, movements/history,
transfers, returns, low-stock notifications, and reporting are owned by later
EPIC-006 issues (SS-113 onward) and are not implemented here. The inventory
read API is implemented in SS-112 (§17.1).

---

# 18. Blog API

GET /blog

List posts.

GET /blog/{slug}

Blog article.

GET /blog/categories

Blog categories.

---

# 19. Blog Administration

POST /admin/blog

Create article.

PATCH /admin/blog/{id}

Update article.

DELETE /admin/blog/{id}

Archive article.

---

# 20. Notifications API

GET /notifications

User notifications.

PATCH /notifications/{id}/read

Mark notification as read.

---

# 21. Product Media Administration API (SS-105)

The product media administration endpoints are M1 admin-side infrastructure.
Media metadata lives in PostgreSQL (`ProductMedia`); the binary contents are
stored through the Product-domain `ProductMediaStorage` abstraction (local disk
in M1, object storage later). The `storageKey` and filesystem paths are never
exposed in responses, audit payloads, or errors.

All endpoints require `JwtAuthGuard` + `RolesGuard` with `OPERATOR` or `ADMIN`.

## Upload media

```
POST /admin/products/{productId}/media
```

`multipart/form-data`. Requires an authenticated OPERATOR/ADMIN.

- `file` (required, single): the image or video binary.
- `mediaType` (optional, `IMAGE | VIDEO`): inferred from detected content when
  omitted; rejected with 409 if it contradicts the detected content.
- `variantId` (optional UUID): the variant the media belongs to. Must belong to
  the same product (404 otherwise).
- `isPrimary` (optional boolean): only meaningful for the first image.

Validated formats and limits (per the product-catalog spec):

- Images: JPG, PNG, WEBP — validated by MIME + magic bytes.
- Videos: MP4 — validated by MIME + ISOBMFF `ftyp` container signature (no
  codec/stream validation in M1).
- Maximum size: 10 MB (enforced at the multipart interceptor and service level).

Ownership rules:

- The owning product must exist and not be soft-deleted (404).
- An `ARCHIVED` product rejects new media (409).
- A supplied `variantId` must exist, not be soft-deleted, and belong to the
  route `productId` (404 otherwise).
- The `productId` always comes from the route param, never the client body.

Primary/order semantics (M1):

- The first uploaded IMAGE automatically becomes primary (CATALOG-006).
- Only one IMAGE may be primary; videos are never primary.
- Uploading the first image with `isPrimary: false` is rejected with 409 so a
  product always has a primary image.
- `sortOrder` is server-generated (incrementing per product); it is not
  client-controlled in SS-105. Reordering is deferred.

Success returns `201` with a `ProductMediaSummary` (no `storageKey`). Errors:
`400` invalid file, `401` unauthenticated, `403` forbidden, `404` product or
variant not found, `409` archived product or media-type mismatch.

## List media

```
GET /admin/products/{productId}/media
```

Returns the active (non-soft-deleted) media of a product as
`ProductMediaSummary[]`, ordered by `sortOrder`. `404` when the product is
missing or soft-deleted.

## Download / preview media

```
GET /admin/products/{productId}/media/{mediaId}
```

Returns the media binary (`StreamableFile`) using the stored MIME type and a
sanitized `Content-Disposition` (the `originalName` is display-only). Missing,
soft-deleted, or cross-product media, and missing binaries all return `404`.
No public URL is exposed in M1.

## Delete media

```
DELETE /admin/media/{id}
```

Soft-deletes the `ProductMedia` row and removes its binary after the database
transaction commits. If the deleted media was the primary image, the next image
by `sortOrder` is promoted to primary. Returns `200` with `{ removed: true }`,
or `404` when the media does not exist or is already soft-deleted.

Watermarking, image optimization, thumbnails, and video transcoding are not part
of SS-105; they are deferred (M2). Public/storefront media delivery is out of
scope for this milestone.

---

# 22. Filtering

Collection endpoints support filtering using query parameters.

Examples:

- category
- brand
- price_min
- price_max
- partner_tier
- availability
- status
- created_from
- created_to

---

# 23. Sorting

Supported sort fields include:

- newest
- oldest
- price
- popularity
- best_selling
- rating
- alphabetical

---

# 24. Pagination

Collection endpoints return paginated responses.

Parameters:

page

limit

The default page size is 20 records.

---

# 25. Authorization

Public

- Product browsing
- Category browsing
- Blog
- Search

Authenticated Customer

- Orders
- Cart
- Wishlist
- Checkout
- Profile

Partner

- Partner pricing
- RFQ
- Business orders

Operator

- Partner approvals
- Order management
- Product management

Administrator

- Full platform administration

---

# 26. API Versioning

The API uses URI versioning.

Current Version

/api/v1

Future versions will be introduced without breaking existing clients.

---

# 27. API Security

The API applies baseline security middleware to every request.

## Security Headers

The API uses [Helmet](https://helmetjs.github.io/) to set standard HTTP security headers, including:

- `Content-Security-Policy` — restricts resource loading to the API origin (`script-src 'self'`); inline styles are allowed so the Swagger UI keeps working in development
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Strict-Transport-Security` (HSTS)
- `Referrer-Policy`
- `Permissions-Policy`

## Rate Limiting

Every route is rate limited per IP address using a global NestJS throttler guard. Limits are applied per IP and per route, so bursts across different endpoints do not count against each other.

Default configuration:

| Setting | Default | Description |
| --- | --- | --- |
| `THROTTLE_LIMIT` | `100` | Maximum requests per window per IP per route |
| `THROTTLE_TTL_MS` | `60000` | Rate limit window length in milliseconds |

When the limit is exceeded the API responds with `429 Too Many Requests` and the `Retry-After` header. Responses include RFC-compatible `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.

Deployment notes:

- The client identity is the request's socket address (`req.ip`). When the API is placed behind a reverse proxy or load balancer, the proxy must be configured to forward the real client address (for example Express `trust proxy`), otherwise every client shares one bucket.
- Limit counters are stored in memory per API process. Multiple replicas each enforce the limit independently; counters reset on restart.

Endpoint-specific protection (for example the Redis-based OTP request and verification limits) is enforced independently and remains in place.

---

# 28. Error Codes

400 Bad Request

401 Unauthorized

403 Forbidden

404 Not Found

409 Conflict

422 Validation Error

429 Too Many Requests

500 Internal Server Error

503 Service Unavailable