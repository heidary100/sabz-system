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