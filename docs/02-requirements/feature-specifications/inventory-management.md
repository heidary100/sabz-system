# Sabz System Platform
# Feature Specification – Inventory & Warehouse Management

Version: 1.0

Module ID: INV-001

Status: Approved for Development

Milestone: 1 (Core), Milestone 2 (Warehouse Enhancements)

Priority: Critical (P1)

---

# 1. Purpose

The Inventory & Warehouse Management module tracks product availability, inventory movements, warehouse locations, stock reservations, and inventory adjustments.

It ensures inventory accuracy across purchasing, sales, returns, and future accounting integrations.

> **M1 boundary (EPIC-005 / SS-104).** In Milestone 1 the only inventory state
> exposed is `ProductVariant.stockQuantity` (a temporary catalog availability
> snapshot), via `PATCH /admin/variants/:id/inventory` (absolute set, never
> negative). Warehouses, multi-warehouse stock, reservations, inventory
> movements/history, receiving, returns, reorder workflows and reporting are
> **EPIC-006** scope and are not implemented in SS-104. No movement or history
> records are created by SS-104.
>
> **EPIC-006 schema foundation (SS-109).** SS-109 applies the inventory schema
> foundation only — no inventory API or UI:
>
> - `InventoryItem` is **authoritative** (one row per variant + warehouse);
>   `ProductVariant.stockQuantity` remains as a **denormalized M1 aggregate**.
> - Every future EPIC-006 stock mutation updates `InventoryItem` and refreshes
>   `ProductVariant.stockQuantity` in the **same transaction** (single write
>   path via the inventory module from SS-111 onward).
> - Existing `stockQuantity` values are backfilled into the default warehouse
>   exactly once by the idempotent bootstrap helper.
> - **available = quantityOnHand − quantityReserved** (derived, never stored).
> - The `InventoryMovement` ledger is immutable (no update/delete columns);
>   `Reservation` schema is applied (`ACTIVE → RELEASED | CONSUMED | EXPIRED`).
> - Active M1 movement types: `INITIAL_STOCK`, `PURCHASE_RECEIPT`,
>   `MANUAL_ADJUSTMENT`, `DAMAGE`, `RESERVATION`, `RESERVATION_RELEASE`. Forward
>   members (`SALE`, `RETURN_RECEIVED`, `RETURN_REJECTED`, `STOCK_TRANSFER`,
>   `HOLO_IMPORT`) are declared for future workflows and are not implemented.
> - Transfers, returns workflow, Holo import, storefront availability, and
>   low-stock alerts remain deferred. Removal of `ProductVariant.stockQuantity`
>   is **not** part of SS-109.
>
> **SS-111 applied decisions (warehouse management).** SS-111 implements the
> admin warehouse management API only — no stock, reservation, movement or
> receive/adjust behavior:
>
> - Routes (all ADMIN-only, `JwtAuthGuard` + `RolesGuard`; no SUPER_ADMIN, no
>   permission RBAC): list (paginated + status filter + name/code search),
>   detail, create, update, activate, deactivate. No DELETE endpoint.
> - Warehouses are soft-delete-aware (`deletedAt`); every read and lifecycle
>   operation treats soft-deleted warehouses as 404. There is no soft-delete
>   endpoint — deactivation is the operational lifecycle mechanism.
> - `code` is trimmed and stored as provided (case-sensitive) with uniqueness
>   enforced by the database; a duplicate `code` returns 409 race-safely
>   (P2002).
> - Deterministic list ordering: `createdAt DESC`, then `id DESC`.
> - **Last-active-warehouse invariant:** the platform must never have zero
>   active, non-deleted warehouses. Deactivating the last active warehouse
>   returns 409. The active warehouse rows are locked (`SELECT ... FOR UPDATE`)
>   inside an interactive transaction so concurrent deactivations cannot zero
>   out the active count — exactly one wins and the loser fails with 409.
> - Every mutation is transactional and writes a transactional audit event
>   (`WAREHOUSE_CREATED`, `WAREHOUSE_UPDATED`, `WAREHOUSE_DEACTIVATED`,
>   `WAREHOUSE_ACTIVATED`); an audit failure rolls back the mutation.
> - Responses and audit payloads never expose `deletedAt`, `createdBy`,
>   `updatedBy`, inventory contents, storage paths, or secrets.
> - Warehouse lifecycle operations never create or modify `InventoryItem` or
>   `InventoryMovement` rows. Inactive warehouses may not receive future
>   inventory — that enforcement belongs to the stock operations issue
>   (SS-113), not SS-111.
>
> **SS-112 applied decisions (inventory read API).** SS-112 implements the
> read-only admin inventory API — no mutations, no movements, no reservations:
>
> - Routes (all `OPERATOR` + `ADMIN`, `JwtAuthGuard` + `RolesGuard`; no
>   SUPER_ADMIN, no permission RBAC): `GET /admin/inventory` (paginated
>   overview with `variantId`/`warehouseId`/`stockStatus` filters and SKU/name
>   search), `GET /admin/inventory/variants/{variantId}` (per-variant stock
>   across active warehouses, returned as an array), and
>   `GET /admin/warehouses/{warehouseId}/inventory` (paginated per-warehouse
>   stock).
> - **availability = quantityOnHand − quantityReserved is always derived at
>   read time and never stored** (no `available` column; the read API computes
>   it per row).
> - **Stock status is derived at runtime** from the available quantity against
>   `reorderLevel`/`criticalLevel`: `OUT_OF_STOCK` when `available <= 0`,
>   `LOW_STOCK` when `available <= reorderLevel` (`criticalLevel` is the
>   fallback threshold when `reorderLevel` is unset), else `IN_STOCK`.
>   `criticalLevel` maps into the same `LOW_STOCK` bucket — there is no fourth
>   status in the shared contract.
> - **Operational-read lifecycle rule:** soft-deleted variants, soft-deleted or
>   ARCHIVED products, and soft-deleted or INACTIVE warehouses are always
>   excluded. `InventoryItem` rows are permanent (no `deletedAt`). Reads treat
>   missing/deleted/archived variants and missing/deleted/inactive warehouses
>   as 404.
> - **Deterministic ordering:** overview and warehouse-scoped reads use
>   `createdAt DESC`, then `id DESC`; variant-scoped reads use `warehouse.code
>   ASC`, then `id ASC`.
> - **Aggregate boundary:** the shared aggregate helper
>   (`InventoryService` / `inventory-aggregate.ts`) computes
>   `SUM(InventoryItem.quantityOnHand)` across **active, non-deleted**
>   warehouses for **active (non-deleted, non-ARCHIVED)** variants/products.
>   A variant with no qualifying `InventoryItem` rows aggregates to `0`.
>   Inactive warehouses never contribute. SS-112 exposes this helper so SS-113
>   refreshes `ProductVariant.stockQuantity` in the same transaction as every
>   mutation — zero drift between the authoritative `InventoryItem` values and
>   the `ProductVariant.stockQuantity` projection.
> - **SS-104 compatibility endpoint:** `PATCH /admin/variants/:id/inventory`
>   remains available in M1 as the temporary boundary and is **not** modified
>   by SS-112. It is repointed through the inventory write path by SS-113
>   (deprecated, not removed in M1). SS-112 introduces no new writer of
>   `ProductVariant.stockQuantity`.
> - Responses never expose `deletedAt`, `createdBy`, `updatedBy`,
>   `InventoryMovement.reference`, or other internal storage/audit fields.
> - Reads are non-mutating: no `InventoryMovement` rows and no inventory
>   changes are created by any read endpoint.

> **SS-113 applied decisions (inventory mutation API).** SS-113 implements the
> EPIC-006 core stock mutations — receive and absolute adjust — plus the SS-104
> compatibility handoff. No reservations, transfers, returns, Holo import,
> movement-history API, or inventory UI:
>
> - Routes (all `OPERATOR` + `ADMIN`, `JwtAuthGuard` + `RolesGuard`; no
>   SUPER_ADMIN, no permission RBAC): `POST /admin/inventory/receive` and
>   `POST /admin/inventory/adjust`. Success returns HTTP 200 with the SS-112
>   `InventoryItemSummary` (post-mutation state); responses never expose
>   `deletedAt`, `createdBy`, `updatedBy` or `InventoryMovement.reference`.
> - **Receive** (`quantity` integer > 0, optional trimmed `notes` max 1000) is
>   an atomic increment against the authoritative `InventoryItem`. The
>   first-ever receipt for a `(variantId, warehouseId)` pair creates the item
>   and writes `INITIAL_STOCK` (`onHandBefore = 0`); later receipts write
>   `PURCHASE_RECEIPT`. Two concurrent receives on the same item both succeed:
>   the row is locked (`SELECT ... FOR UPDATE`) and the increment is atomic; the
>   first-receipt create race is resolved by the composite unique constraint
>   with a bounded retry (P2002), so both first-ever receives succeed.
> - **Adjust** (`quantity` integer >= 0 is the **absolute desired
>   `quantityOnHand`**, mandatory trimmed non-empty `reason` max 500, optional
>   trimmed `notes` max 1000) computes `delta = requested − current` and writes
>   a signed `MANUAL_ADJUSTMENT` movement with exact `onHandBefore/After`
>   snapshots. The item write is a conditional expected-value update
>   (`quantityOnHand = <in-transaction read>` + lifecycle predicate): concurrent
>   adjustments resolve to exactly **one winner** and the stale requester
>   receives 409 with no movement/audit. A same-value adjust (delta 0) still
>   records a zero-delta movement and audit. Adjust never creates items (404
>   when absent) and can never produce negative stock.
> - **Every successful mutation writes exactly one immutable
>   `InventoryMovement` and exactly one transactional `AuditLog` event**
>   (`INVENTORY_RECEIVED` / `INVENTORY_ADJUSTED`, `entity = "InventoryItem"`,
>   flat camelCase payload with balances and delta). An audit failure rolls back
>   the item change, the movement and the aggregate.
> - **`InventoryItem` is authoritative; `ProductVariant.stockQuantity` is the
>   denormalized aggregate** refreshed in the same transaction via the shared
>   `aggregateVariantStock` helper (active, non-deleted warehouses; active
>   non-deleted, non-ARCHIVED variants/products; absent rows aggregate to 0 —
>   byte-identical scope to SS-112 reads). The variant row is locked
>   (`SELECT ... FOR UPDATE`) before the aggregate is computed so concurrent
>   mutations on different items of the same variant cannot write a stale
>   aggregate.
> - **SS-104 compatibility endpoint repoint:** `PATCH /admin/variants/:id/
>   inventory` remains available in M1 (deprecated, not removed) but no longer
>   writes `ProductVariant.stockQuantity` directly. It delegates to the
>   inventory write path: an absolute set on the **default warehouse**
>   (`code = 'DEFAULT'`, ensured idempotently), `MANUAL_ADJUSTMENT` movement,
>   aggregate refresh and the legacy `PRODUCT_INVENTORY_SET` audit, all in one
>   transaction. `VariantsService` performs no stock transaction anymore; there
>   is exactly one inventory write path (`InventoryService`).
> - **Known residual gap (out of SS-113 scope):** the SS-104 variant **create**
>   path still accepts an optional `stockQuantity` that is written only to
>   `ProductVariant.stockQuantity` without an `InventoryItem` row. A variant
>   created this way after bootstrap has `stockQuantity = N` but aggregates to
>   0 until stock is received/adjusted or bootstrap is re-run. Removing the
>   field or routing create through the write path is deferred to a follow-up
>   issue.
> - `InventoryItem` rows are permanent (no `deletedAt`); mutations never
>   resurrect deleted variants/products or mutate inactive warehouses
>   (missing/deleted → 404, archived product or inactive warehouse → 409).
>
> **SS-114 applied decisions (inventory history API).** SS-114 implements the
> read-only admin movement-history API over the immutable ledger — no
> mutations, no reversal, no edit/delete:
>
> - Route: `GET /admin/inventory/movements` (`OPERATOR` + `ADMIN`,
>   `JwtAuthGuard` + `RolesGuard`; no SUPER_ADMIN, no permission RBAC),
>   returning `PaginatedResult<InventoryMovementSummary>` with `page`
>   (default 1), `limit` (default 20, max 100).
> - **Exact filters (AND-combined):** `variantId` (UUID, exact), `warehouseId`
>   (UUID, exact), `type` (all eleven enum members valid, including
>   forward-declared types not produced in M1), and `from`/`to` bounding
>   `createdAt` **inclusively** (ISO 8601 UTC; date-only values interpreted as
>   UTC midnight, matching SS-064; `from > to` → 400).
> - **Deterministic ordering:** `createdAt DESC`, then `id DESC`.
> - **Historical soft-delete semantics:** the movement row itself determines
>   visibility. No active-resource lifecycle filter is applied — movements for
>   soft-deleted variants/products and soft-deleted or deactivated warehouses
>   remain queryable, and filter values are predicates (a valid but nonexistent
>   UUID returns an empty page, never 404).
> - **Actor resolution:** batched lookup from `InventoryMovement.createdBy`
>   (no N+1, deduplicated). Missing actor rows resolve to `actor: null`
>   without dropping the movement; soft-deleted actors resolve normally.
> - **Data minimization:** `reference` is never selected or exposed; responses
>   never contain `createdBy`, `updatedBy`, `deletedAt`, `updatedAt` or
>   internal/secret fields.
> - **Immutability:** SS-114 adds no mutation surface — no movement
>   edit/delete/reversal endpoints exist in M1 and no application path can
>   update or delete ledger rows.
>
> **SS-115 applied decisions (reservation API).** SS-115 implements the
> admin reservation lifecycle — reserve, release, consume, list — with lazy
> transactional expiration. No transfers, returns, Holo import, checkout
> integration or customer-owned reservations:
>
> - Routes (all `OPERATOR` + `ADMIN`, `JwtAuthGuard` + `RolesGuard`; no
>   SUPER_ADMIN, no permission RBAC): `POST /admin/inventory/reserve`,
>   `POST /admin/inventory/reservations/{id}/release`,
>   `POST /admin/inventory/reservations/{id}/consume` and
>   `GET /admin/inventory/reservations`. (The requirement-level
>   `POST /admin/inventory/release` from §12 is implemented as the
>   reservation-scoped route above; this block is authoritative.)
> - **M1 ownership:** reservations are created by OPERATOR/ADMIN only. No
>   customer ownership, no order/payment/checkout integration and no external
>   reservation owner model.
> - **Availability = quantityOnHand − quantityReserved** (derived, never
>   stored). `POST /admin/inventory/reserve` succeeds only when availability
>   covers the requested `quantity` (integer > 0), otherwise 409; the item row
>   is locked (`SELECT ... FOR UPDATE`) so concurrent reservations cannot
>   oversell. Reserve increments `quantityReserved` only — `quantityOnHand`
>   and `ProductVariant.stockQuantity` are untouched. The `InventoryItem` for
>   the exact pair must already exist (404 otherwise; reserve never creates
>   items) and the SS-113 lifecycle gates apply (missing/deleted → 404,
>   archived product or inactive warehouse → 409).
> - **`expiresIn` (optional positive seconds, max 10 years)** derives
>   `expiresAt = now + expiresIn * 1000` server-side; an absent `expiresIn`
>   means the reservation never expires. There is no platform TTL environment
>   variable — expiration is caller-configured (matches the shared contract)
>   and is not part of the future checkout flow.
> - **State machine:** only `ACTIVE → RELEASED | CONSUMED | EXPIRED`; terminal
>   states never resurrect. Transitions are conditional updates
>   (`WHERE status = ACTIVE`): exactly one winner per transition; the losing
>   release/consume receives 409 and the losing expiration skips silently
>   (no movement, no audit, no decrement).
> - **Release** restores availability (decrements `quantityReserved` only;
>   `RESERVATION_RELEASE` movement, `INVENTORY_RELEASED` audit). **Consume**
>   decrements both `quantityReserved` and `quantityOnHand` (on-hand
>   re-checked under the lock — never negative; `SALE` movement,
>   `INVENTORY_CONSUMED` audit) and refreshes `ProductVariant.stockQuantity`
>   in the same transaction. **Release/consume do not re-validate the current
>   product/variant/warehouse lifecycle** so reserved stock can always be
>   unwound after a warehouse is deactivated or a product is archived.
> - **Lazy expiration:** ACTIVE reservations with `expiresAt <= now` are
>   transitioned to `EXPIRED` at the start of the next reservation mutation
>   transaction (reserve/release/consume) — transactionally, per
>   `InventoryItem` lock, with one `RESERVATION_RELEASE` movement (reason
>   `انقضای خودکار رزرو`) and one `INVENTORY_RELEASED` audit per expired
>   reservation, and no double-release under concurrent triggers. There is
>   **no worker, cron, scheduler or polling infrastructure**; the list route
>   is strictly read-only and never expires rows. Expiration never changes
>   `quantityOnHand` and never refreshes the aggregate.
> - **Aggregate boundary:** `ProductVariant.stockQuantity` is refreshed only
>   when `quantityOnHand` changes — consume only. Reserve, release and expire
>   are reservation-only changes and never refresh it. The refresh reuses the
>   shared `aggregateVariantStock` helper unchanged.
> - **Movement/audit guarantees:** exactly one `InventoryMovement` + exactly
>   one `AuditLog` (`entity = "Reservation"`, `entityId = reservation.id`)
>   per successful mutation in the same transaction; audit failure rolls back
>   everything. `reference` is never written or exposed; responses expose the
>   shared `ReservationSummary` contract only.
> - **List:** `PaginatedResult<ReservationSummary>`, `page` (default 1),
>   `limit` (default 20, max 100), `status`/`variantId`/`warehouseId` filters
>   as AND-combined predicates (nonexistent UUID → empty page, malformed →
>   400), ordering `createdAt DESC`, then `id DESC`.
> - **No schema change:** the SS-109 `Reservation` model, `(status, expiresAt)`
>   and `(inventoryItemId)` indexes fully cover SS-115.

---

# 2. Goals

- Maintain accurate stock levels
- Prevent overselling
- Support multiple warehouses
- Record complete inventory history
- Support stock reservations during checkout
- Enable inventory reconciliation
- Integrate with Holo accounting software

---

# 3. Actors

- Customer
- Partner
- Operator
- Warehouse Staff (Future)
- Super Administrator

---

# 4. Business Rules

### INV-001

Inventory is managed at the Product Variant level.

---

### INV-002

Inventory quantities cannot become negative.

---

### INV-003

Every inventory change must create a movement record.

---

### INV-004

Reserved inventory is unavailable for new orders.

---

### INV-005

Inventory adjustments require an explanation.

---

### INV-006

Archived products cannot receive inventory transactions.

---

### INV-007

Returns increase inventory only after inspection and approval.

---

# 5. Inventory Model

Available Stock

=

On Hand

−

Reserved

---

Definitions

**On Hand**

Physical quantity in the warehouse.

**Reserved**

Allocated to pending orders.

**Available**

Can be sold immediately.

**Incoming**

Expected from suppliers.

---

# 6. Warehouse Management

The system shall support:

- Multiple warehouses
- Warehouse activation/deactivation
- Warehouse addresses
- Internal warehouse codes
- Warehouse contact information

Each warehouse shall maintain independent inventory.

---

# 7. Inventory Movements

Movement Types

- Initial Stock
- Purchase Receipt
- Sale
- Reservation
- Reservation Release
- Manual Adjustment
- Return Received
- Return Rejected
- Damage
- Stock Transfer
- Import from Holo

Every movement records:

- Product Variant
- Warehouse
- Quantity
- Previous balance
- New balance
- Reference document
- Reason
- Timestamp
- User

---

# 8. Stock Reservation

During checkout:

Available Stock

↓

Reserve Quantity

↓

Payment Pending

↓

Payment Successful

↓

Convert Reservation to Sale

OR

Payment Failed

↓

Release Reservation

Reservation expiration shall be configurable.

---

# 9. Stock Adjustments

Operators may perform adjustments for:

- Counting differences
- Damaged items
- Lost inventory
- Supplier corrections
- Administrative corrections

Every adjustment requires:

- Reason
- Notes
- User
- Approval (optional)

---

# 10. Low Stock Alerts

Each variant shall have:

- Reorder Level
- Critical Level

Notifications are generated when stock falls below configured thresholds.

---

# 11. User Stories

### INV-US-001

As an Operator,

I want to receive inventory into the warehouse,

so products become available for sale.

Acceptance Criteria

- Quantity increases.
- Inventory movement recorded.
- Audit log created.

---

### INV-US-002

As a Customer,

I want to see only products that are available,

so I do not order unavailable items.

Acceptance Criteria

- Availability reflects reserved stock.
- Out-of-stock items are clearly identified.

---

### INV-US-003

As a Warehouse Operator,

I want to adjust inventory,

so stock reflects the physical count.

Acceptance Criteria

- Reason required.
- Previous quantity recorded.
- Audit trail generated.

---

### INV-US-004

As an Administrator,

I want inventory reserved during checkout,

so overselling does not occur.

Acceptance Criteria

- Reservation created.
- Reservation expires automatically.
- Stock released if payment fails.

---

# 12. API Endpoints

Public

GET /products/{id}/availability

Authenticated

GET /inventory/my-reservations

Administration

GET /admin/inventory

GET /admin/inventory/movements

POST /admin/inventory/receive

POST /admin/inventory/adjust

POST /admin/inventory/reserve

POST /admin/inventory/release

POST /admin/inventory/transfer

GET /admin/warehouses

POST /admin/warehouses

PATCH /admin/warehouses/{id}

---

# 13. Validation Rules

Quantity

- Required
- Greater than zero (except adjustments where negatives are valid)

Warehouse

- Required

Reason

- Required for adjustments

Variant

- Required

Transfer

- Source and destination warehouses must differ

---

# 14. Authorization

Customer

- View product availability

Partner

- View product availability

Operator

- Receive stock
- Adjust stock
- Reserve inventory
- Release reservations
- View inventory history

Super Administrator

- Full inventory administration
- Manage warehouses
- Reverse inventory transactions (with audit)

---

# 15. Audit Events

The system shall record:

- Stock receipts
- Sales deductions
- Reservations
- Reservation releases
- Inventory adjustments
- Transfers
- Returns
- Warehouse creation
- Warehouse updates

---

# 16. Dependencies

Requires:

- Product Catalog
- Orders
- Authentication & Identity

Provides services to:

- Shopping Cart
- Checkout
- Reporting
- Holo Integration

---

# 17. Test Scenarios

Positive Tests

- Receive stock
- Reserve inventory
- Complete order
- Release reservation
- Manual adjustment
- Warehouse transfer
- Return received
- Low-stock notification

Negative Tests

- Reserve more than available
- Negative inventory
- Invalid warehouse
- Missing adjustment reason
- Transfer to same warehouse
- Archived product inventory update

---

# 18. Definition of Done

The Inventory & Warehouse Management module is complete when:

- Inventory movements are recorded correctly.
- Available stock calculations are accurate.
- Reservations prevent overselling.
- Warehouse management functions as specified.
- Low-stock alerts are generated.
- Audit logging is operational.
- Integration tests validate inventory consistency under concurrent transactions.
- The module is accepted during the Milestone 2 review.