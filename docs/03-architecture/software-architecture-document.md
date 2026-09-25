# Sabz System Platform
# Software Architecture Document (SAD)

Version: 1.0

---

# 1. Purpose

This document defines the high-level software architecture of the Sabz System Platform. It establishes the system structure, architectural principles, module boundaries, technology stack, and integration strategy to ensure a scalable, maintainable, and secure application.

---

# 2. Architecture Goals

The architecture is designed to achieve the following goals:

- Modular and maintainable codebase
- High performance and scalability
- Clear separation of concerns
- Secure authentication and authorization
- Extensible feature set
- Integration-ready design
- SEO-friendly storefront
- Reliable data consistency
- Efficient administration workflows

---

# 3. Architectural Style

Sabz System Platform will initially be implemented as a **Modular Monolith**.

Each business domain will be isolated into independent modules with clear interfaces, enabling future migration to microservices if required.

Advantages:

- Faster development
- Easier deployment
- Lower operational cost
- Simpler debugging
- Future scalability

---

# 4. High-Level Architecture

Client Applications

- Web Storefront (B2C/B2B)
- Admin Dashboard

↓

Application Layer

- REST API
- Authentication
- Authorization
- Validation

↓

Business Layer

- Users
- Partners
- Products
- Inventory
- Pricing
- Orders
- Payments
- Shipping
- CMS
- Notifications
- Reporting

↓

Infrastructure Layer

- PostgreSQL
- Redis

The following infrastructure pieces appear in target designs but are **not
part of the current implementation**: object storage, a dedicated search
engine, and background-job processing. Media and documents are stored on
local disk through storage-driver abstractions; search runs in PostgreSQL;
media/import processing is in-process.

↓

External Services (future integrations — none are currently connected)

- Payment Gateway
- Holo Accounting
- Torob
- SMS Provider
- Email Provider
- Tipax
- Iran Post

---

# 5. Technology Stack

Frontend (Storefront)

- Next.js (App Router)
- React
- TypeScript
- Tailwind CSS (Tailwind Plus Ecommerce components)

Frontend (Admin)

- React (Vite)
- TypeScript
- Tailwind CSS
- Catalyst UI Kit
- Persian-first, RTL

Backend

- NestJS
- TypeScript
- REST API

Database

- PostgreSQL

Caching

- Redis

ORM

- Prisma

Storage

- Current implementation: local-disk storage drivers (business documents and
  product media) behind storage abstractions.
- Future/planned: S3-compatible object storage.

Background Processing

- Current implementation: none — media watermarking and catalog-import
  batching run in-process.
- Future/planned: a job queue (e.g. BullMQ).

Authentication

- JWT
- Refresh Tokens
- OTP (SMS)

Deployment

- Current implementation: Docker, Docker Compose (local development).
- Future/planned: production deployment behind a reverse proxy (e.g. Nginx).

---

# 6. System Modules

Identity

- Authentication
- Registration
- OTP
- Sessions

Users

- Profiles
- Addresses
- Preferences

Partners

- Verification
- Tier Management
- Business Documents

Products

- Categories
- Brands
- Attributes
- Variants
- Media

Inventory

- Warehouses
- Stock Levels
- Stock Reservations

Pricing

- Retail Pricing
- Tier Pricing
- Bulk Discounts
- RFQ

Orders

- Cart
- Checkout
- Order Lifecycle

Payments

- Payment Processing
- Transactions
- Refunds

Shipping

- Shipping Methods
- Tracking
- Delivery Status

Returns

- Return Requests
- Return Approval

CMS

- Blog
- Pages
- SEO Metadata

Notifications

- SMS
- Email
- Administrative Alerts

Reporting

- Sales Reports
- Inventory Reports
- Partner Reports

Administration

- Roles
- Permissions
- Audit Logs
- Configuration

---

# 7. Cross-Cutting Concerns

The following concerns apply to every module:

- Authentication
- Authorization
- Validation
- Logging
- Auditing
- Error Handling
- Localization
- Performance Monitoring

---

# 8. Security Principles

- Passwords are securely hashed.
- Sensitive data is encrypted where appropriate.
- All APIs require authentication unless explicitly public.
- Role-based access control is enforced.
- Administrative actions are recorded in audit logs.
- File uploads are validated before storage.
- Rate limiting protects public endpoints.

---

# 9. Performance Strategy

- Redis caching
- Optimized database indexes
- Lazy loading
- Pagination
- Image optimization
- CDN-ready media delivery
- Background job processing (future — processing is in-process today)
- API response caching

---

# 10. Deployment Environments

Development

- Local Docker environment

Testing

- Staging server

Production

- High-availability Linux server
- HTTPS enabled
- Automated backups
- Monitoring and logging

---

# 11. Design Principles

- Domain-driven modularization
- SOLID principles
- Dependency Injection
- Repository Pattern
- Service Layer
- Clean Architecture concepts
- API-first development
- Specification-Driven Development

---

# 12. Future Evolution

The architecture is intentionally designed to support future extraction of independent services such as:

- Search Service
- Notification Service
- Pricing Service
- Inventory Service
- Payment Service

without requiring significant changes to the existing business logic.