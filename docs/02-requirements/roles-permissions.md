# Sabz System Platform
# Roles & Permissions Matrix

Version: 1.0

---

# 1. Purpose

This document defines the authorization model for the Sabz System Platform.

It specifies:

- System roles
- Permissions
- Data ownership
- Administrative responsibilities
- Approval workflows
- Resource access rules

The Roles & Permissions Matrix serves as the single source of truth for backend authorization, frontend navigation, and administrative capabilities.

---

# 2. System Roles

The platform defines the following roles:

## Public Guest

Unauthenticated visitors.

Responsibilities

- Browse products
- Search products
- View blog
- Register
- Login

---

## Customer (B2C)

Authenticated retail customers.

Responsibilities

- Purchase products
- Manage personal profile
- Manage addresses
- Place orders
- Request returns
- Maintain wishlist

---

## Partner Tier 3 (Retailer)

Verified retail reseller.

Responsibilities

- Purchase using Tier 3 pricing
- Submit RFQ requests
- View business invoices

---

## Partner Tier 2 (Wholesaler)

Regional wholesale partner.

Responsibilities

All Tier 3 permissions plus:

- Access Tier 2 pricing
- Higher quantity purchasing
- Enhanced pricing benefits

---

## Partner Tier 1 (Distributor)

Highest-level business partner.

Responsibilities

All Tier 2 permissions plus:

- Access floor pricing
- Maximum purchase limits
- Distributor-specific pricing

---

## Operator

Internal staff member.

Responsibilities

- Review partner applications
- Manage products
- Manage inventory
- Process orders
- Review returns

Restrictions

Operators cannot:

- Delete users
- Modify system configuration
- Change administrator roles
- View sensitive system settings

---

## Super Administrator

Full system administrator.

Responsibilities

Complete control over every module.

> The implemented application roles are `CUSTOMER`, `PARTNER`, `OPERATOR`, and
> `ADMIN` — there is no `SUPER_ADMIN` role. This section describes the future
> administrative capability; the "Super Administrator" column in the matrix
> maps to the implemented `ADMIN` role for the implemented scope (see §10).

---

# 3. Permission Groups

Permissions are organized into the following modules:

Identity

Users

Partners

Products

Categories

Brands

Inventory

Pricing

Orders

Payments

Shipping

Returns

CMS

Media

Notifications

Reports

System Settings

Audit Logs

---

# 4. Permission Matrix

Legend

✓ = Allowed

R = Read Only

A = Approval Required

— = Not Allowed

| Permission | Guest | Customer | Partner | Operator | Super Admin |
|------------|:----:|:--------:|:-------:|:--------:|:-----------:|
| Browse products | ✓ | ✓ | ✓ | ✓ | ✓ |
| Search products | ✓ | ✓ | ✓ | ✓ | ✓ |
| View blog | ✓ | ✓ | ✓ | ✓ | ✓ |
| Register account | ✓ | — | — | — | — |
| Login | ✓ | ✓ | ✓ | ✓ | ✓ |
| Manage profile | — | ✓ | ✓ | ✓ | ✓ |
| Manage addresses | — | ✓ | ✓ | ✓ | ✓ |
| View partner prices | — | — | ✓ | ✓ | ✓ |
| Submit RFQ | — | — | ✓ | ✓ | ✓ |
| Place retail order | — | ✓ | ✓ | ✓ | ✓ |
| View own orders | — | ✓ | ✓ | ✓ | ✓ |
| Request return | — | ✓ | ✓ | ✓ | ✓ |
| Upload business documents | — | — | ✓ | ✓ | ✓ |
| View approval status | — | — | ✓ | ✓ | ✓ |
| Approve partner | — | — | — | ✓ | ✓ |
| Reject partner | — | — | — | ✓ | ✓ |
| Manage products | — | — | — | ✓ | ✓ |
| Manage categories | — | — | — | ✓ | ✓ |
| Manage brands | — | — | — | ✓ | ✓ |
| Manage inventory | — | — | — | ✓ | ✓ |
| Manage pricing rules | — | — | — | R | ✓ |
| Process orders | — | — | — | ✓ | ✓ |
| Process returns | — | — | — | ✓ | ✓ |
| Publish blog posts | — | — | — | ✓ | ✓ |
| Upload media | — | — | — | ✓ | ✓ |
| View reports | — | — | — | ✓ | ✓ |
| Export reports | — | — | — | ✓ | ✓ |
| View audit logs | — | — | — | R | ✓ |
| Manage users | — | — | — | R | ✓ |
| Assign roles | — | — | — | — | ✓ |
| Modify permissions | — | — | — | — | ✓ |
| Manage system settings | — | — | — | — | ✓ |

---

# 5. Data Ownership Rules

## Customers

May access only:

- Their own profile
- Their own addresses
- Their own cart
- Their own wishlist
- Their own orders
- Their own invoices
- Their own return requests

Customers cannot access another user's information.

---

## Partners

May access:

- Their company profile
- Their uploaded documents
- Their purchase history
- Their RFQ requests
- Their pricing tier

Partners cannot access another partner's data.

---

## Operators

May manage:

- Products
- Categories
- Brands
- Inventory
- Orders
- Returns
- Partner approvals

Operators may not:

- Delete customer accounts
- Change pricing algorithms
- Modify system configuration
- View password hashes or authentication secrets

---

## Super Administrator

Has unrestricted access to all business entities and system configuration.

---

# 6. Approval Workflows

## Partner Registration

Partner submits application

↓

Application status = Pending (PENDING)

↓

Operator reviews documents

↓

Approved

or

Rejected

↓

Partner receives notification (future scope — Notification Service not yet implemented)

---

## Return Request

Customer submits request

↓

Operator reviews request

↓

Approved

or

Rejected

↓

Inventory updated

↓

Refund (if applicable)

---

## Product Publication

Operator creates product

↓

Product reviewed (optional)

↓

Published

↓

Visible to customers

---

# 7. Pricing Visibility Rules

Guest

- Retail prices only

Customer

- Retail prices only

Partner Tier 3

- Tier 3 prices

Partner Tier 2

- Tier 2 prices

Partner Tier 1

- Tier 1 (floor) prices

Operator

- All pricing levels (read-only)

Super Administrator

- Full access to pricing configuration

---

# 8. Administrative Restrictions

Critical actions require elevated privileges.

Only Super Administrators may:

- Assign administrator roles
- Change permission sets
- Configure pricing formulas
- Manage system settings
- Delete audit records
- Restore archived records
- Perform full data exports

---

# 9. Security Principles

- Least Privilege: Users receive only the permissions required for their role.
- Separation of Duties: Operational tasks and system administration are separated.
- Auditability: Administrative actions are logged.
- Role Inheritance: Partner tiers inherit permissions from lower tiers where applicable.
- Explicit Authorization: Every protected API endpoint must verify permissions before execution.

---

# 10. Authorization Implementation Notes (SS-016)

## Application Roles

The authorization foundation (SS-016) defines the following application-level roles:

- `CUSTOMER`
- `PARTNER`
- `OPERATOR`
- `ADMIN`

Role checks use the `@Roles(...)` decorator with the `RolesGuard`. `@Roles(A, B)` grants access to a user holding **either** role. Routes without `@Roles()` require authentication only, when protected by `JwtAuthGuard`.

Roles are resolved server-side from the `UserRole` → `Role` tables at request time. They are **not** embedded in JWT payloads, so the database remains the single source of truth for authorization. A user may hold multiple roles simultaneously (AUTH-005).

SS-027 removed the `UserProfile.userType` column; it previously duplicated the role names and could not represent multiple simultaneous roles. User classification now lives exclusively in the role tables, and `GET /api/v1/auth/profile` returns the user's role names instead of a `userType` value.

## Known Gap: AUTH-006

AUTH-006 ("Administrative roles are assigned only by Super Administrators") cannot be enforced with the current role model, which defines only `CUSTOMER`, `PARTNER`, `OPERATOR`, and `ADMIN`. There is no `SUPER_ADMIN` role.

The authorization foundation does not invent a super-admin role and does not implement role assignment. Enforcement of AUTH-006 — including a super-administrator elevation path — is deferred to the admin/role-management issues.

## Partner Review Authorization (SS-040)

The partner review API (`GET/PATCH /admin/partners*`) is implemented with
`OPERATOR` and `ADMIN` — the application roles that exist in the system. The
"Super Administrator" column above maps to the implemented `ADMIN` role for the
implemented scope; the platform does not introduce a `SUPER_ADMIN` role.

- Approve partner: `OPERATOR` / `ADMIN`
- Reject partner: `OPERATOR` / `ADMIN`
- Change tier: `OPERATOR` / `ADMIN`
- Preview partner documents: `OPERATOR` / `ADMIN`

Unauthenticated requests return `401`; `CUSTOMER` and `PARTNER` return `403`.
The backend is the security boundary — client-side admin checks are UX only.

## User Lifecycle Authorization (SS-062)

The admin user lifecycle API (`PATCH /admin/users*`) is implemented with:

- Suspend / unsuspend: `OPERATOR` / `ADMIN`
- Unlock: `ADMIN` only

An `OPERATOR` may not act on an `ADMIN`-role account (`403`), consistent with
the "Operators cannot change administrator roles" restriction. Self-suspension
and suspension of the last active `ADMIN` are rejected with `409`. See
[Admin User Lifecycle API](../05-api/api-specification.md#53-admin-user-lifecycle-api-ss-062).

## Role Administration Authorization (SS-063)

The admin role administration API (`GET /admin/roles`,
`PUT /admin/users/{id}/roles/{role}`, `DELETE /admin/users/{id}/roles/{role}`)
is implemented with `ADMIN` only, mapping the matrix's "Assign roles" row to the
implemented `ADMIN` role:

- Assign a role: `ADMIN` only
- Remove a role: `ADMIN` only
- List roles/permissions: `ADMIN` only
- `CUSTOMER`, `PARTNER`, `OPERATOR`: `403`

Role administration is `ADMIN`-only in M1; there is no `SUPER_ADMIN` and no
privileged hierarchy beyond `ADMIN`. Assignment is additive and idempotent;
`ADMIN`-role removal and self role modification are forbidden; the
last-active-`ADMIN` invariant cannot be weakened through role mutations because
no role mutation can reduce `ADMIN` membership. See
[Admin Role Administration API](../05-api/api-specification.md#54-admin-role-administration-api-ss-063).

---

# 11. Future Roles

The authorization model is designed to support additional roles without major architectural changes, including:

- Marketplace Seller
- Warehouse Manager
- Customer Support Agent
- Marketing Manager
- Finance Manager
- Content Editor
- External Auditor