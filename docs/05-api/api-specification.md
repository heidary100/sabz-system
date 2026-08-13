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

Successful Response

```json
{
  "success": true,
  "data": {},
  "message": "Operation completed successfully."
}
```

Validation Error

```json
{
  "success": false,
  "message": "Validation failed.",
  "errors": {
    "mobile": [
      "Mobile number is required."
    ]
  }
}
```

Server Error

```json
{
  "success": false,
  "message": "Internal server error."
}
```

---

# 4. Authentication API

POST /auth/register

Registers a new retail customer.

POST /auth/login

Authenticates a user.

POST /auth/logout

Terminates the current session.

POST /auth/refresh

Issues a new access token.

POST /auth/forgot-password

Initiates password reset.

POST /auth/reset-password

Completes password reset.

POST /auth/send-otp

Sends OTP to a mobile number.

POST /auth/verify-otp

Verifies the OTP.

GET /auth/profile

Returns the authenticated user's profile.

PATCH /auth/profile

Updates the authenticated user's profile.

---

# 5. Partner API

POST /partners/apply

Submit partner application.

GET /partners/application

Retrieve current application.

PATCH /partners/application

Update application before approval.

POST /partners/documents

Upload business documents.

GET /partners/status

Retrieve approval status.

GET /partners/tier

Retrieve current partner tier.

GET /partners/pricing

Retrieve partner-specific pricing information.

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

Manage users.

GET /admin/partners

Manage partners.

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