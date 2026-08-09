# Sabz System Platform
# Order Flow

Version: 1.0

---

# Order Lifecycle

```
PENDING -> CONFIRMED -> PROCESSING -> SHIPPED -> DELIVERED
  |           |            |
CANCELLED  CANCELLED   RETURNED
```

# Detailed Order Flow

## Step 1: Add to Cart

```
[Customer] -> POST /cart/items
    Request:
    - productId (UUID)
    - quantity (int)

    -> [System] validates product exists and is PUBLISHED
    -> [System] validates stock availability
    -> [System] calculates price (retail or tier-based for partners)
    -> [System] adds item to cart (Redis or DB)
    -> Response: cart summary with items
```

## Step 2: Checkout

```
[Customer] -> POST /orders/checkout
    Request:
    - shippingAddressId (UUID)
    - paymentMethod (ONLINE)

    -> [System] validates cart items
    -> [System] re-validates stock and pricing
    -> [System] reserves inventory
    -> [System] creates Order with status PENDING
    -> [System] creates OrderItems from cart
    -> [System] clears cart
    -> Response: { orderId, totalAmount, paymentUrl }
```

## Step 3: Payment

```
[Customer] -> redirected to Payment Gateway
    -> [Customer] completes payment
    -> [Payment Gateway] -> callback /api/v1/payments/callback
    -> [System] verifies payment
    -> [System] updates Payment status -> SUCCESS
    -> [System] updates Order status -> CONFIRMED
    -> [System] sends SMS confirmation to customer
    -> [System] notifies operators
```

## Step 4: Processing

```
[Operator] -> GET /admin/orders?status=CONFIRMED
    -> [Operator] reviews order

[Operator] -> PATCH /admin/orders/:id/status
    - status: PROCESSING

    -> [System] updates order status
    -> [System] triggers warehouse preparation
```

## Step 5: Shipping

```
[Operator] -> POST /admin/orders/:id/ship
    Request:
    - carrier (TIPAX | IRAN_POST)
    - trackingCode (string)

    -> [System] updates Order status -> SHIPPED
    -> [System] creates Shipping record
    -> [System] sends tracking SMS to customer
```

## Step 6: Delivery

```
[System] receives shipping status update (webhook or polling)
    -> [System] updates Shipping status -> DELIVERED
    -> [System] updates Order status -> DELIVERED
    -> [System] sends delivery confirmation to customer
```

---

# Cancellation Flow

```
[Customer] -> POST /orders/:id/cancel
    -> [System] validates order is in CANCELLABLE state (PENDING or CONFIRMED)
    -> [System] updates Order status -> CANCELLED
    -> [System] releases reserved inventory
    -> [System] initiates refund if payment was made
    -> [System] sends cancellation confirmation
```

---

# Return Flow

```
[Customer] -> POST /orders/:id/return-request
    Request:
    - reason (string)
    - items: [{ orderItemId, quantity }]

    -> [System] creates ReturnRequest with status PENDING
    -> [System] notifies operators

[Operator] -> POST /admin/returns/:id/approve
    -> [System] updates ReturnRequest -> APPROVED
    -> [System] creates refund in Payment Gateway
    -> [System] updates inventory (restock)
    -> [System] sends return approval to customer

[Operator] -> POST /admin/returns/:id/reject
    -> [System] updates ReturnRequest -> REJECTED
    -> [System] sends rejection reason to customer
```
