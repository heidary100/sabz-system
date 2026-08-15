# Sabz System Platform
# Entity Relationship Model

Version: 1.0

---

# Overview

This document describes the core entities and their relationships within the Sabz System Platform. For the full database design including column definitions, indexes, and constraints, see [Database Design Specification](database-design-specification.md).

---

# Core Entities

## Identity Domain

The identity domain models every authenticated person in the platform. **User** is the identity root entity; **Customer**, **Partner**, and administrative staff are represented as profile extensions of the identity rather than separate inheritance hierarchies.

```
Identity Domain
User (identity root)
+-- UserProfile (one-to-one)
|   +-- Customer (profile type, no dedicated table)
|   +-- Partner (profile extension — the partner application aggregate)
|       +-- BusinessDocument[]
|       +-- PartnerTier
+-- Role (many-to-many via UserRole)
+-- Permission (many-to-many via RolePermission)
+-- UserSession
```

- **User**: Identity root entity. Holds authentication identity (unique mobile number, optional unique email, password hash), account status, and last login. Contains no profile fields. Authorization is derived exclusively from roles (UserRole → Role); no separate user classification is used (SS-027).
- **UserProfile**: One-to-one profile extension of User. Holds names, avatar, and an optional personal/contact address. Every user has exactly one profile. User classification (customer, partner, admin, operator) is expressed through roles, not stored on the profile.
- **Customer**: A role/classification of users representing B2C end-users. No dedicated table is required; customer-specific data is covered by UserProfile and Address.
- **Partner**: The partner application aggregate (SS-038). One persistent Partner row exists per UserProfile (unique `profile_id`); it owns the onboarding lifecycle (DRAFT → PENDING → APPROVED/REJECTED, REJECTED → PENDING). Stores the business/legal operating address (address, city, province) collected during the partner application — distinct from the user's personal address on UserProfile (SS-028).
- **BusinessDocument**: Metadata for a partner business document. Metadata is stored in PostgreSQL; binary contents live outside the database through the Partner-domain DocumentStorage abstraction (SS-038).
- **PartnerTier**: Defines pricing tiers (Tier 1, Tier 2, Tier 3) with discount rules.
- **Role**: System roles (admin, operator, customer, partner) assigned to users through a many-to-many junction.
- **Permission**: Granular permissions mapped to roles through a many-to-many junction.
- **UserSession**: Device session records supporting concurrent devices, refresh tokens, and revocation.

---

## Product Hierarchy

```
Product
+-- Category (tree structure)
+-- Brand
+-- ProductMedia (images, videos)
+-- ProductSpecification (key-value attributes)
+-- Inventory
    +-- Warehouse
    +-- StockLevel
```

- **Product**: Core product entity with title, slug, description, and status.
- **Category**: Hierarchical categories supporting parent-child relationships.
- **Brand**: Product manufacturer/brand classification.
- **ProductMedia**: Associated images and videos with watermarking support.
- **ProductSpecification**: Dynamic key-value attribute pairs for product specs.
- **Inventory**: Stock tracking per product per warehouse.
- **Warehouse**: Physical storage location reference.

---

## Order Hierarchy

```
Order
+-- OrderItem
+-- Payment
    +-- Transaction
+-- Shipping
    +-- TrackingEvent
```

- **Order**: Customer order with status lifecycle (pending, confirmed, shipped, delivered).
- **OrderItem**: Individual line items with product reference, quantity, and pricing.
- **Payment**: Payment record linked to gateway transactions.
- **Transaction**: Individual payment gateway transaction with status.
- **Shipping**: Shipping method and carrier information.
- **TrackingEvent**: Delivery tracking checkpoints.

---

## Supporting Entities

- **Address**: User addresses for shipping and billing (a future entity). Not to be confused with UserProfile.address (personal/contact address) or the Partner business address fields — the three are distinct concepts (SS-028).
- **Role**: System roles (admin, operator, customer, partner). Assigned to users through the `UserRole` junction.
- **Permission**: Granular permissions mapped to roles through the `RolePermission` junction.
- **UserRole**: Junction table linking users to roles, enabling multiple roles per user (AUTH-005).
- **RolePermission**: Junction table linking roles to permissions.
- **BlogPost**: Content management for SEO articles.
- **AuditLog**: Administrative action tracking.
- **MediaFile**: Shared file storage references.

---

# Key Relationships

| Relationship | Type | Description |
|--------------|------|-------------|
| User -> UserProfile | One-to-One | Every user has exactly one profile |
| UserProfile -> Partner | One-to-One | A profile may extend to a partner (optional; one persistent Partner aggregate per profile) |
| Partner -> BusinessDocument | One-to-Many | A partner owns many business documents |
| Partner -> PartnerTier | Many-to-One | Partners belong to a pricing tier |
| User -> Role | Many-to-Many | Users hold multiple roles (via UserRole) |
| Role -> Permission | Many-to-Many | Roles have multiple permissions (via RolePermission) |
| User -> UserSession | One-to-Many | Users have multiple device sessions |
| Product -> Category | Many-to-One | Products belong to one category |
| Product -> Brand | Many-to-One | Products belong to one brand |
| Product -> ProductMedia | One-to-Many | Products have multiple media files |
| Product -> Inventory | One-to-One | Products have inventory records |
| Order -> User | Many-to-One | Orders belong to customers |
| Order -> OrderItem | One-to-Many | Orders contain multiple items |
| Order -> Payment | One-to-Many | Orders may have multiple payment attempts |
| OrderItem -> Product | Many-to-One | Items reference products |
