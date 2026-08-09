# Sabz System Platform
# Feature Specification – Payment Management

Version: 1.0

Module ID: PAYMENT-001

Status: Approved for Development

Milestone: 2 (Core), Milestone 3 (Refunds & Reconciliation)

Priority: Critical (P1)

---

# 1. Purpose

The Payment Management module processes customer payments, verifies transactions, handles payment gateway callbacks, supports refunds, and maintains a complete financial audit trail.

The module provides a unified payment abstraction independent of any specific payment gateway.

---

# 2. Goals

- Secure online payment processing
- Gateway abstraction
- Reliable callback handling
- Payment verification
- Refund processing
- Financial reconciliation
- Full payment audit trail

---

# 3. Actors

- Customer
- Partner
- Operator
- Finance Manager (Future)
- Super Administrator

---

# 4. Business Rules

### PAYMENT-001

Every payment is associated with exactly one order.

---

### PAYMENT-002

An order may have multiple payment attempts.

---

### PAYMENT-003

Only one successful payment may exist for an order.

---

### PAYMENT-004

Payment callbacks must be verified before updating order status.

---

### PAYMENT-005

Duplicate gateway callbacks shall be handled idempotently.

---

### PAYMENT-006

Refunds cannot exceed the original paid amount.

---

### PAYMENT-007

All monetary values shall use the smallest supported currency unit (for example, Rials) to avoid floating-point errors.

---

### PAYMENT-008

Payment records are immutable after completion except through approved financial workflows.

---

# 5. Payment Lifecycle

Payment Created

↓

Redirect to Gateway

↓

Customer Pays

↓

Gateway Callback

↓

Verification

↓

Succeeded

OR

Failed

OR

Cancelled

↓

Update Order

↓

Generate Receipt

---

# 6. Functional Requirements

## Payment Initiation

The system shall:

- Create a payment record
- Generate a unique payment reference
- Redirect the customer to the selected gateway
- Prevent duplicate active payment sessions

---

## Payment Verification

After receiving a callback:

- Verify authenticity
- Verify transaction amount
- Verify payment reference
- Verify payment status
- Update payment record
- Update order status
- Publish payment events

---

## Payment Attempts

The system shall:

- Record every payment attempt
- Allow retry after failure
- Prevent duplicate successful payments

---

## Refunds

Operators shall be able to:

- Initiate full refunds
- Initiate partial refunds (future)
- Record manual refunds
- Track refund status

---

## Payment Receipts

Customers shall be able to:

- View payment history
- Download receipts
- View gateway reference numbers

---

# 7. Supported Payment Methods

Current

- Online Payment Gateway

Planned

- Cash on Delivery
- Bank Transfer
- SnappPay Installments
- Wallet Balance
- Gift Card

---

# 8. User Stories

### PAYMENT-US-001

As a customer,

I want to securely pay for my order,

so I can complete my purchase.

Acceptance Criteria

- Payment record created.
- Customer redirected to gateway.
- Successful payment updates the order automatically.

---

### PAYMENT-US-002

As a customer,

I want to retry payment after a failure,

so I can complete my purchase without creating a new order.

Acceptance Criteria

- Failed attempt recorded.
- New payment attempt created.
- Order remains in Pending Payment.

---

### PAYMENT-US-003

As an Operator,

I want to view payment history,

so I can assist customers with payment issues.

Acceptance Criteria

- All payment attempts displayed.
- Gateway references visible.
- Status history available.

---

### PAYMENT-US-004

As an Administrator,

I want to process refunds,

so customer issues can be resolved efficiently.

Acceptance Criteria

- Refund amount validated.
- Refund recorded.
- Order updated.
- Audit log created.

---

# 9. Payment Statuses

Pending

Processing

Succeeded

Failed

Cancelled

Expired

Refund Pending

Refunded

Partially Refunded

---

# 10. API Endpoints

Customer

POST /payments

GET /payments/{id}

GET /payments/history

POST /payments/{id}/retry

GET /payments/{id}/receipt

Gateway

POST /payments/callback

POST /payments/webhook

Administration

GET /admin/payments

GET /admin/payments/{id}

POST /admin/payments/{id}/refund

GET /admin/payments/reconciliation

---

# 11. Validation Rules

Payment Amount

- Greater than zero
- Must equal current order balance

Gateway Callback

- Signature validation required
- Transaction ID required
- Payment reference required

Refund

- Cannot exceed paid amount
- Order must have a successful payment

---

# 12. Authorization

Customer

- Create payment
- View own payment history
- Retry payment
- Download receipts

Partner

- Same as Customer

Operator

- View payment records
- View reconciliation reports

Super Administrator

- Full payment administration
- Process refunds
- Configure payment providers

---

# 13. Audit Events

The system shall record:

- Payment created
- Redirect initiated
- Callback received
- Verification completed
- Payment succeeded
- Payment failed
- Refund initiated
- Refund completed
- Manual financial adjustments

---

# 14. Dependencies

Requires:

- Authentication & Identity
- Order Management

Provides services to:

- Inventory (confirm stock deduction)
- Shipping (release fulfillment)
- Notifications
- Reporting
- Accounting Integration

---

# 15. Test Scenarios

Positive Tests

- Create payment
- Successful callback
- Successful verification
- Retry failed payment
- Generate receipt
- Process refund

Negative Tests

- Invalid callback signature
- Duplicate callback
- Incorrect payment amount
- Expired payment session
- Duplicate successful payment
- Refund exceeding original amount
- Unauthorized refund request

---

# 16. Definition of Done

The Payment Management module is complete when:

- Payments are processed securely.
- Callback verification is reliable.
- Duplicate callbacks are handled safely.
- Multiple payment attempts are supported.
- Refund workflows operate correctly.
- Financial audit records are complete.
- Automated tests validate payment and refund scenarios.
- The module is approved during the Milestone 2 review.