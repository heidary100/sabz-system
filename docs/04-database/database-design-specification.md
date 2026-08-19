# Sabz System Platform
# Database Design Specification (DDS)

Version: 1.1

---

# 1. Purpose

This document defines the logical data model for the Sabz System Platform. It identifies the business entities, their relationships, constraints, and lifecycle.

The database is designed to support:

- B2C and B2B commerce
- Tier-based pricing
- Inventory management
- Order processing
- Content management
- Future scalability

---

# 2. Database Technology

Database Engine

- PostgreSQL

ORM

- Prisma ORM

Migration Strategy

- Version-controlled migrations

Soft Delete Strategy

- `deleted_at` timestamp

Audit Fields

Every business entity should include:

- id
- created_at
- updated_at
- deleted_at (nullable)
- created_by (nullable)
- updated_by (nullable)

---

# 3. Domain Model

The platform is organized into the following domains:

Identity

- User
- UserProfile
- Role
- Permission
- User Role (junction)
- Role Permission (junction)
- User Session

Partners

- Partner
- Partner Tier
- Business Document

Catalog

- Category
- Brand
- Product
- Product Variant
- Product Image
- Product Video
- Product Attribute
- Attribute Value

Inventory

- Warehouse
- Inventory Item
- Inventory Movement

Commerce

- Cart
- Cart Item
- Order
- Order Item

Pricing

- Price List
- Pricing Rule
- Bulk Discount
- RFQ Request

Payments

- Payment
- Transaction
- Refund

Shipping

- Shipment
- Shipping Method
- Tracking Event

Returns

- Return Request
- Return Item

CMS

- Blog Post
- Blog Category
- SEO Metadata

Media

- Media Asset

Communication

- Notification
- Notification Template

Administration

- Audit Log
- System Setting

---

# 4. Core Entity Definitions

## User

Purpose

Represents every authenticated person in the platform. **User is the identity root entity.** Profile fields are stored in UserProfile; type-specific data (customer, partner, admin, operator) is expressed through roles and profile extensions.

Fields

- id
- mobile
- email
- password_hash
- status
- last_login_at
- deleted_at
- created_by
- updated_by

Relationships

- One User → One UserProfile
- One User → Many Addresses (via UserProfile)
- One User → Many Orders
- One User → Many Roles (via UserRole junction)
- One User → Many UserSessions

Business Rules

- Mobile number must be unique.
- Email is optional but unique if provided.
- Password hash is nullable to allow future authentication methods (OTP, OAuth).
- A user may hold multiple roles simultaneously (AUTH-005).
- Authorization is derived exclusively from the user's roles (UserRole → Role); no other user classification is used for authorization (SS-027).
- Soft delete via `deleted_at`; records are retained but hidden.

---

## UserProfile

Purpose

One-to-one profile extension of User. Holds identity profile data (names, avatar, personal address).

Fields

- id
- user_id
- first_name
- last_name
- avatar_url
- address — personal/contact address of the individual user (e.g. for the profile endpoint). Distinct from the Partner business address (SS-028); the two address concepts are never interchangeable.
- created_at
- updated_at
- deleted_at

Relationships

- One UserProfile → One User
- One UserProfile → Many Addresses
- One UserProfile → One Partner (optional)

Business Rules

- Every user has exactly one profile.
- User classification (customer, partner, admin, operator) is not stored on the profile; it is expressed through roles (SS-027).
- Customers require no dedicated table; partner data extends via the Partner entity.

---

## Role

Purpose

Groups permissions for Role-Based Access Control (RBAC).

Fields

- id
- name
- description
- created_at
- updated_at

Relationships

- Many Roles → Many Users (via UserRole junction)
- Many Roles → Many Permissions (via RolePermission junction)

Business Rules

- Role names must be unique.
- A user may hold multiple roles simultaneously (AUTH-005).
- Administrative roles are assigned only by Super Administrators (AUTH-006).

  > **Status: known gap / deferred.** There is no `SUPER_ADMIN` role; the
  > implemented admin role is `ADMIN`. AUTH-006 is preserved as a future
  > requirement; enforcement is deferred to the admin/role-management work
  > (see Roles & Permissions Matrix §10).

---

## Permission

Purpose

Granular capability grants mapped to roles.

Fields

- id
- name
- resource
- action
- created_at
- updated_at

Relationships

- Many Permissions → Many Roles (via RolePermission junction)

Business Rules

- Permission names must be unique.
- Users receive permissions only through their roles.

---

## User Role

Purpose

Junction table enabling the many-to-many relationship between users and roles.

Fields

- user_id
- role_id
- assigned_at
- assigned_by

Constraints

- Composite primary key (user_id, role_id).
- Foreign keys cascade on user or role deletion.

---

## Role Permission

Purpose

Junction table enabling the many-to-many relationship between roles and permissions.

Fields

- role_id
- permission_id
- assigned_at

Constraints

- Composite primary key (role_id, permission_id).
- Foreign keys cascade on role or permission deletion.

---

## User Session

Purpose

Tracks authenticated device sessions for session management.

Fields

- id
- user_id
- refresh_token
- device_id
- ip_address
- expires_at
- revoked_at
- created_at
- updated_at

Relationships

- Many UserSessions → One User

Business Rules

- A user may have multiple concurrent sessions (multiple devices).
- Sessions can be revoked individually or in bulk.
- Expired or revoked sessions cannot refresh tokens.

---

## Partner

Purpose

Represents a B2B business account. **Partner is the application aggregate (SS-038).** A user becomes a partner after approval, which grants the PARTNER role (SS-027). The Partner entity owns the onboarding lifecycle; there is exactly one persistent Partner row per UserProfile (enforced by the unique `profile_id`), so an application is the Partner row itself — not a separate table.

Fields

- id
- profile_id
- business_name
- business_license_number
- national_id
- website
- address — business/legal operating address of the B2B partner entity, collected during the partner application. Distinct from UserProfile.address, the user's personal address (SS-028); do not merge the two concepts.
- city — business city; part of the partner business address (see address).
- province — business province; part of the partner business address (see address).
- tier
- approval_status (default `DRAFT`)
- approved_at
- submitted_at
- rejected_at
- rejection_reason
- review_notes
- created_at
- updated_at
- deleted_at

Relationships

- One Partner → One UserProfile
- One Partner → Many Orders
- One Partner → Many BusinessDocuments

Lifecycle

```
DRAFT
  ↓
PENDING
  ↓
APPROVED
  or
REJECTED
  ↓
PENDING (corrected and resubmitted)
```

> **Enum ordering note (SS-038):** PostgreSQL appends new enum values at the
> end, so the physical `PartnerApprovalStatus` type orders
> `PENDING, APPROVED, REJECTED, DRAFT` even though `schema.prisma` declares
> `DRAFT` first. Do not rely on `ORDER BY "approvalStatus"` for lifecycle
> ordering; the `submitted_at` timestamp is the lifecycle ordering key.

Business Rules

- A user becomes a partner only after partner application approval (AUTH-003).
- One persistent Partner aggregate exists per profile (unique `profile_id`) — the v1 invariant.
- Cannot access partner pricing until approved (AUTH-004).
- Tier determines pricing visibility.
- A business license document is required before the application can be submitted and before it can be approved.
- Document verification (per-document review and a `verified` marker) is deferred to SS-040; the applied `BusinessDocument` schema does not yet carry a `verified` flag.

---

## BusinessDocument

Purpose

Metadata record for a document uploaded as part of the partner lifecycle. **Metadata lives in PostgreSQL; the binary file contents are stored outside the database** through the Partner-domain `DocumentStorage` abstraction (SS-038).

Fields

- id
- partner_id
- type — `BUSINESS_LICENSE`, `NATIONAL_ID`, `TAX_REGISTRATION`, or `SUPPORTING`
- original_name — display-only metadata; never used to derive the storage key
- mime_type
- size_bytes
- storage_key — server-generated (`partners/<partner_id>/<document_id>.<safe-extension>`), unique
- created_at
- updated_at
- deleted_at

Relationships

- Many BusinessDocuments → One Partner

Business Rules

- Storage keys are server-generated and never derived from user filenames.
- The `storage_key` must be unique at the database level.
- Storage paths are never exposed as public URLs.
- The `partner_id` foreign key cascades on Partner deletion, but the database
  cascade cannot delete the binary files behind those rows. Physical file
  cleanup must happen at the application layer (the SS-039 document-removal
  flow, which calls `DocumentStorage.delete`); the cascade alone would
  otherwise orphan files under `partners/<partner_id>/`.
- **Applicant deletions and replacements (SS-039):** when an applicant removes a
  document (`DELETE /partners/documents/{id}`) or replaces a document of the
  same type, the `BusinessDocument` row is soft-deleted and the binary is
  removed through `DocumentStorage` (best-effort after the database commit,
  with failures logged). This is only possible while the application is
  `DRAFT` or `REJECTED`; post-approval documents are not deletable by the
  applicant, so approval-time audit retention is preserved. The interplay with
  PARTNER-008 ("business documents must be retained for audit purposes unless
  deleted according to legal or business retention policies") remains an open
  concern for a future storage-retention policy; SS-039 intentionally does not
  introduce such a policy or a reconciliation job.

---

## Product

Purpose

Represents a sellable item.

> **SKU ownership (SS-100):** the sellable SKU is owned by **ProductVariant**,
> not by Product. Product has **no** `sku` field. See ProductVariant below.

Fields

- id
- name
- slug
- short_description
- description
- brand_id
- category_id
- warranty
- condition (`NEW`, `OPEN_BOX`, `REFURBISHED`, `USED`, `STOCK_CLEARANCE`)
- status (`DRAFT`, `PUBLISHED`, `ARCHIVED`)
- weight_kg
- width_cm
- height_cm
- depth_cm
- origin_country

Relationships

- One Product → Many Variants
- One Product → Many Media
- Many Products → One Brand
- Many Products → One Category (single required `category_id`, M1 decision)

Business Rules

- Slug must be unique.
- Archived products cannot be purchased.
- Product lifecycle in M1 is `DRAFT → PUBLISHED → ARCHIVED`. No Pending Review
  workflow; `HIDDEN` is not part of M1 and may be added later as a forward
  enum migration.
- A product must have at least one variant before publication — an
  **application-level invariant** (the schema alone cannot enforce it).

---

## Product Variant

Purpose

Represents a purchasable variation of a product.

> **SKU ownership (SS-100):** ProductVariant owns the sellable `sku` (unique).
> Product has no SKU. `price` is the retail/base price (`Decimal(12,2)`).
> `stockQuantity` is a **temporary M1 catalog availability snapshot**, not the
> eventual EPIC-006 inventory system of record (see Inventory Boundary below).

Fields

- id
- product_id
- sku
- barcode
- name (display label only; configurable attributes deferred to SS-104)
- price (retail/base price, `Decimal(12,2)`)
- stock_quantity (`Int`, default `0`)

Relationships

- Many Variants → One Product
- One Variant → Many Media (optional)

Business Rules

- Each variant has an independent retail/base price.
- `stockQuantity` must conceptually never be negative (application-level
  invariant, enforced from SS-103/SS-104; no DB CHECK in SS-100).

---

## Category

Purpose

Organizes products into a hierarchical catalog.

Fields

- id
- name
- slug
- parent_id (self-referencing, unlimited logical depth)
- sort_order
- is_visible

Relationships

- Self-referencing tree via `parent_id`
- One Category → Many Products

Business Rules

- Unlimited nesting supported; no fixed-depth restriction.
- Slugs must be unique.

---

## Brand

Purpose

Product manufacturer/brand classification.

Fields

- id
- name
- slug
- description
- logo_key (storage reference only; binary storage belongs to SS-105)
- is_featured

Relationships

- One Brand → Many Products

Business Rules

- Brand slugs must be unique.
- `logo_key` is a server-generated storage reference; no public URL is stored.

---

## ProductMedia

Purpose

Images and videos attached to a product (and optionally a variant).

> **Storage boundary (SS-100):** Product media uses a Product-domain-specific
> storage abstraction. `storage_key` is server-generated and never derived from
> the client filename; the binary contents live outside PostgreSQL behind that
> abstraction (local disk + future S3 seam). SS-100 establishes only the schema
> boundary; the `ProductMediaStorage` provider is implemented in SS-105.

Fields

- id
- product_id
- variant_id (optional)
- media_type (`IMAGE`, `VIDEO`)
- original_name
- mime_type
- size_bytes
- storage_key (unique, server-generated)
- sort_order
- is_primary

Relationships

- Many Media → One Product
- Many Media → One Variant (optional)

Business Rules

- `storage_key` must be unique at the database level.
- The first image is the primary thumbnail; `is_primary`/`sort_order` are
  application-level invariants (enforced in SS-105).
- Storage paths are never exposed as public URLs.

---

## Inventory Boundary (SS-100 vs EPIC-006)

`ProductVariant.stock_quantity` is a **temporary M1 catalog availability
snapshot**. It is **not** the future inventory system of record.

EPIC-006 will own: warehouses, multi-warehouse stock, reservations, inventory
movements/history, receiving, returns, reorder workflows, and inventory
reporting. EPIC-006 may later replace `stock_quantity` or maintain it as a
denormalized projection, keyed by the stable `variant_id`.

---

## Inventory Item

Purpose

Tracks stock for each product variant.

Fields

- id
- warehouse_id
- variant_id
- quantity_on_hand
- quantity_reserved
- reorder_level

Business Rules

Available Stock = Quantity On Hand − Quantity Reserved

Stock cannot become negative.

---

## Pricing Rule

Purpose

Defines pricing calculations.

Fields

- id
- rule_name
- category_id
- partner_tier
- calculation_method
- value
- priority

Business Rules

Higher-priority rules override lower-priority rules.

Only one final price is presented to the customer.

---

## Order

Purpose

Represents a completed customer purchase.

Fields

- id
- order_number
- customer_id
- payment_status
- shipping_status
- total_amount
- final_amount
- order_status

Relationships

- One Order → Many Order Items
- One Order → One Payment
- One Order → One Shipment

Lifecycle

Pending

↓

Awaiting Payment

↓

Paid

↓

Processing

↓

Packed

↓

Shipped

↓

Delivered

↓

Completed

Alternative States

Cancelled

Returned

Refunded

---

## Order Item

Purpose

Represents a purchased product.

Fields

- order_id
- variant_id
- quantity
- unit_price
- discount
- subtotal

Business Rules

Unit price is immutable after purchase.

---

## Payment

Fields

- payment_method
- gateway_reference
- amount
- payment_status
- paid_at

Statuses

Pending

Succeeded

Failed

Refunded

---

## Shipment

Fields

- shipping_method
- tracking_number
- carrier
- shipment_status

Statuses

Pending

Packed

Dispatched

Delivered

Returned

---

## Return Request

Fields

- order_id
- reason
- description
- status

Statuses

Requested

Approved

Rejected

Received

Refunded

---

# 5. Entity Relationships

User

↓

UserProfile

↓

Partner (optional, when approved)

↓

Orders

↓

Order Items

↓

Product Variant

↓

Product

↓

Category

User

↓

Roles (via UserRole)

↓

Permissions (via RolePermission)

User

↓

Sessions

Product

↓

Inventory

↓

Warehouse

Partner

↓

Pricing Rules

↓

Products

---

# 6. Indexing Strategy

Indexes should exist for:

- Mobile number
- Email
- SKU
- Slug
- Category hierarchy
- Product title
- Partner tier
- Order number
- Payment reference
- Tracking number
- User status
- Role name
- Permission name
- Session refresh token
- Partner approval status
- Partner approval status + submitted_at (composite; covers the status-only access pattern)
- Business document partner + deleted_at (composite)

Composite indexes should be used where appropriate for filtering and reporting.

Catalog indexes (SS-100):

- `Category.slug` (unique)
- `Category.parent_id`
- `Category (is_visible, deleted_at)`
- `Brand.slug` (unique)
- `Product.slug` (unique)
- `Product (status, deleted_at)`
- `Product (category_id, deleted_at)`
- `Product (brand_id, deleted_at)`
- `ProductVariant.sku` (unique)
- `ProductVariant (product_id, deleted_at)`
- `ProductMedia.storage_key` (unique)
- `ProductMedia (product_id, deleted_at)`
- `ProductMedia (product_id, sort_order)`
- `ProductMedia (variant_id)`

---

# 7. Data Integrity

The system must enforce:

- Foreign key constraints
- Unique constraints
- Cascading updates where appropriate
- Restricted deletes for critical business records
- Soft deletion for business entities

---

# 8. Auditing

The following actions must be recorded:

- User authentication
- Partner approvals
- Product modifications
- Inventory adjustments
- Pricing changes
- Order status changes
- Payment updates
- Administrative actions

Audit logs must include:

- Timestamp
- User
- Action
- Entity
- Previous value
- New value
- IP address (if available)

Partner audit events (implemented from SS-039/SS-040 onward) must never place
sensitive data in `before`/`after` payloads: national ID, business license
number, file contents, raw storage paths that reveal sensitive information,
tokens, and secrets are excluded.

---

# 9. Future Extensions

The data model supports future additions including:

- Marketplace sellers
- Multi-warehouse inventory
- Multi-language content
- Multi-currency pricing
- Loyalty programs
- Gift cards
- Subscription products
- AI recommendations