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

Dashboard metrics.

GET /admin/users

Manage users. Implemented as the paginated operator/admin read API — see
[Admin User Read API](#52-admin-user-read-api-ss-061) — plus the account
lifecycle endpoints — see [Admin User Lifecycle API](#53-admin-user-lifecycle-api-ss-062).

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

POST /admin/products

Create product.

PATCH /admin/products/{id}

Update product.

DELETE /admin/products/{id}

Archive product.

POST /admin/products/{id}/restore

Restore archived product.

---

# 15. Category Administration

POST /admin/categories

Create category.

PATCH /admin/categories/{id}

Update category.

DELETE /admin/categories/{id}

Archive category.

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

GET /admin/inventory

Inventory overview.

PATCH /admin/inventory/{id}

Adjust stock.

POST /admin/inventory/import

Bulk inventory import.

GET /admin/inventory/history

Inventory movements.

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

# 21. Media API

POST /media/upload

Upload image or video.

DELETE /media/{id}

Delete media.

GET /media/{id}

Retrieve media.

All uploaded product images must automatically receive the configured watermark before becoming publicly available.

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