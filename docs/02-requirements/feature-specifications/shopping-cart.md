# Sabz System Platform
# Feature Specification – Shopping Cart & Checkout

Version: 1.0

Module ID: CART-001

Status: Approved for Development

Milestone: 2

Priority: Critical (P1)

---

# 1. Purpose

The Shopping Cart & Checkout module enables customers and approved business partners to select products, review pricing, choose shipping and payment methods, and create orders.

This module coordinates with the Pricing Engine, Inventory, Order Management, Payment Gateway, and Shipping services to provide a reliable purchasing experience.

---

# 2. Goals

- Manage persistent shopping carts
- Validate inventory before checkout
- Recalculate prices during checkout
- Reserve inventory
- Collect shipping information
- Create orders
- Redirect users to payment

---

# 3. Actors

- Customer
- Partner
- Operator (View only)
- Super Administrator

---

# 4. Business Rules

### CART-001

Each authenticated user has one active shopping cart.

---

### CART-002

Guests may maintain a temporary browser cart, which can be merged into their account after login.

---

### CART-003

Product prices displayed in the cart are recalculated whenever the cart changes.

---

### CART-004

The final price is recalculated immediately before order creation.

---

### CART-005

Inventory is reserved only after checkout begins, not when an item is added to the cart.

---

### CART-006

Checkout cannot continue if inventory becomes unavailable.

---

### CART-007

Only published and purchasable products may be added to the cart.

---

### CART-008

RFQ-only products cannot be added to the standard shopping cart.

---

# 5. Shopping Cart Lifecycle

Create Cart

↓

Add Items

↓

Update Quantities

↓

Remove Items

↓

Apply Pricing Rules

↓

Proceed to Checkout

↓

Validate Cart

↓

Reserve Inventory

↓

Create Order

↓

Redirect to Payment

---

# 6. Functional Requirements

## Shopping Cart

The system shall allow users to:

- Add products
- Remove products
- Update quantities
- Save cart between sessions
- View price summary
- Clear cart

---

## Price Summary

The cart shall display:

- Unit price
- Quantity
- Line total
- Discounts
- Estimated shipping (optional)
- Estimated tax (if applicable)
- Grand total

Prices are informational until checkout validation.

---

## Checkout

Checkout shall include:

### Step 1

Review Cart

---

### Step 2

Shipping Address

- Existing address
- New address

---

### Step 3

Shipping Method

Examples:

- Tipax
- Iran Post
- Local Delivery
- Store Pickup (Future)

---

### Step 4

Payment Method

Examples:

- Online Payment
- Cash on Delivery (eligible orders only)

---

### Step 5

Review Order

The system performs:

- Price recalculation
- Inventory validation
- Shipping validation
- Payment validation

---

### Step 6

Create Order

The system:

- Reserves inventory
- Generates order number
- Creates order items
- Redirects to payment gateway

---

# 7. Order Creation

The order shall include:

- Customer
- Shipping address
- Billing address (future)
- Order items
- Price snapshot
- Discounts
- Shipping fee
- Total amount
- Payment status
- Order status

Order numbers must be unique and sequential according to business requirements.

---

# 8. User Stories

### CART-US-001

As a customer,

I want to add products to my shopping cart,

so I can purchase multiple items together.

Acceptance Criteria

- Product added successfully.
- Cart total updated.
- Pricing recalculated.

---

### CART-US-002

As a customer,

I want to update quantities,

so I can adjust my purchase.

Acceptance Criteria

- Quantity validated.
- Inventory checked.
- Total recalculated.

---

### CART-US-003

As a customer,

I want the system to validate my order before payment,

so I do not pay for unavailable products.

Acceptance Criteria

- Inventory validated.
- Prices recalculated.
- Errors displayed when validation fails.

---

### CART-US-004

As a partner,

I want my tier pricing automatically applied during checkout,

so my wholesale pricing is reflected in the final order.

Acceptance Criteria

- Tier pricing applied.
- Bulk discounts evaluated.
- Final totals correct.

---

# 9. API Endpoints

Shopping Cart

GET /cart

POST /cart/items

PATCH /cart/items/{id}

DELETE /cart/items/{id}

DELETE /cart

Checkout

POST /checkout/validate

POST /checkout

GET /checkout/shipping-methods

GET /checkout/payment-methods

GET /checkout/summary

---

# 10. Validation Rules

Cart Item

- Product must exist
- Product must be published
- Requested quantity must be greater than zero

Checkout

- Shipping address required
- Shipping method required
- Payment method required
- Inventory available
- Pricing valid

---

# 11. Authorization

Customer

- Manage own cart
- Checkout

Partner

- Manage own cart
- Checkout using partner pricing

Operator

- View carts for support purposes (read-only)

Super Administrator

- View and manage carts for administrative purposes

---

# 12. Error Handling

The system shall handle:

- Product unavailable
- Product removed from catalogue
- Price changed
- Inventory shortage
- Invalid shipping method
- Invalid payment method
- Expired reservation
- Checkout timeout

Users shall receive clear messages with instructions to refresh or update their cart where appropriate.

---

# 13. Audit Events

The system shall record:

- Cart creation
- Item added
- Item removed
- Quantity updated
- Checkout initiated
- Checkout validation
- Order created
- Inventory reserved

---

# 14. Dependencies

Requires:

- Authentication & Identity
- Product Catalog
- Pricing Engine
- Inventory
- Shipping
- Payment Gateway

Provides services to:

- Order Management
- Payment Processing
- Reporting
- Notifications

---

# 15. Test Scenarios

Positive Tests

- Add item to cart
- Update quantity
- Remove item
- Merge guest cart after login
- Validate checkout
- Reserve inventory
- Create order
- Redirect to payment

Negative Tests

- Add unpublished product
- Add RFQ-only product
- Exceed available inventory
- Price changes before checkout
- Invalid shipping method
- Invalid payment method
- Reservation expires during checkout
- Checkout with empty cart

---

# 16. Definition of Done

The Shopping Cart & Checkout module is complete when:

- Shopping cart persistence works correctly.
- Prices are recalculated using the Pricing Engine.
- Inventory is reserved during checkout.
- Orders are created successfully.
- Checkout validation prevents invalid purchases.
- Unit, integration, and end-to-end tests pass.
- The module is approved during the Milestone 2 review.