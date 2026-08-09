# Sabz System Platform
# System Context

Version: 1.0

---

# Overview

This document describes the system context — the external actors, dependencies, and boundaries of the Sabz System Platform.

---

# Actors

## Primary Actors

| Actor | Description |
|-------|-------------|
| Customer | End-user who browses and purchases products (B2C) |
| Partner | Verified business account with tier-based pricing (B2B) |
| Operator | Internal staff who manages day-to-day operations |
| Admin | System administrator with full platform access |

## External Systems

| System | Role |
|--------|------|
| PostgreSQL | Primary relational database |
| Redis | Caching layer and session storage |
| Payment Gateway | Online payment processing |
| SMS Provider | OTP delivery and notifications |
| Holo System | Legacy accounting and product data source |
| Torob | Price comparison marketplace integration |
| S3 Storage | Object storage for product media |
| Email Provider | Transactional email delivery |
| Tipax | Shipping carrier integration |
| Iran Post | Shipping carrier integration |

---

# System Boundary Diagram

```
+-----------------------------------------------------+
|                  Sabz System Platform               |
|                                                      |
|  +------------+  +----------+  +------------------+  |
|  | Storefront |  | Admin    |  | REST API         |  |
|  | (Next.js)  |  | (React)  |  | (NestJS)         |  |
|  +-----+------+  +-----+----+  +--------+---------+  |
|        |               |                 |             |
|  +-----+---------------+-----------------+---------+  |
|  |           Business Logic Modules                  |  |
|  |  Auth | Users | Partners | Products | Orders      |  |
|  +-------------------------+-------------------------+  |
|                            |                            |
+----------------------------+----------------------------+
                             |
              +--------------+-------------+
              |              |             |
         +----+----+  +-----+----+  +---+----+
         |PostgreSQL|  |  Redis   |  |  S3    |
         +---------+  +----------+  +--------+

  External Integrations:
  +----------+ +----------+ +------+ +------+
  | Payment  | |   SMS    | | Holo | |Torob |
  | Gateway  | | Provider | |      | |      |
  +----------+ +----------+ +------+ +------+
  +----------+ +----------+ +------+
  |  Email   | |  Tipax   | | Post |
  | Provider | |          | |      |
  +----------+ +----------+ +------+
```

---

# Data Flow Summary

1. **Customers** browse products via the Storefront and place orders through the API.
2. **Partners** access tier-based pricing through the same Storefront with role-based views.
3. **Operators** manage orders, products, and partner requests via the Admin Dashboard.
4. **Admins** configure the platform, manage roles, and monitor system health.
5. The **API** handles all business logic and communicates with PostgreSQL, Redis, and external services.
