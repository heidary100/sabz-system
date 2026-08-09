# Sabz System Platform
# Feature Specification – Product Catalog

Version: 1.0

Module ID: CATALOG-001

Status: Approved for Development

Milestone: 1 (Core), Milestone 2 (Enhancements)

Priority: Critical (P1)

---

# 1. Purpose

The Product Catalog module manages the complete lifecycle of products, categories, brands, attributes, media, variants, and product visibility.

It serves as the central source of truth for all products displayed on the Sabz System Platform.

---

# 2. Goals

- Organize products into hierarchical categories
- Support configurable product attributes and variants
- Manage product media (images & videos)
- Provide SEO-friendly product pages
- Support both new and stock/refurbished products
- Enable future marketplace expansion

---

# 3. Actors

- Guest
- Customer
- Partner
- Operator
- Super Administrator

---

# 4. Business Rules

### CATALOG-001

Every product belongs to at least one category.

---

### CATALOG-002

Each product must have a unique SKU.

---

### CATALOG-003

Each product has a unique SEO slug.

---

### CATALOG-004

Archived products remain visible in historical orders but cannot be purchased.

---

### CATALOG-005

Products may have multiple images and videos.

---

### CATALOG-006

The first image is the primary thumbnail.

---

### CATALOG-007

Every uploaded product image is automatically watermarked before publication.

---

### CATALOG-008

A product may have one or more variants.

---

### CATALOG-009

Inventory is tracked at the variant level.

---

### CATALOG-010

Stock/Refurbished products must clearly indicate their condition.

---

# 5. Product Lifecycle

Draft

↓

Pending Review (optional)

↓

Published

↓

Hidden

↓

Archived

Only Published products are visible to customers.

---

# 6. Functional Requirements

## Categories

The system shall support:

- Unlimited hierarchy
- Category images
- Category SEO metadata
- Sort order
- Visibility toggle

---

## Brands

The system shall support:

- Brand logo
- Brand description
- Brand SEO page
- Featured brands

---

## Products

Each product shall include:

- SKU
- Name
- Slug
- Short description
- Full description
- Brand
- Category
- Warranty
- Condition
- Status
- Weight
- Dimensions
- Country of origin

---

## Product Variants

Variants may include:

- Color
- Capacity
- Size
- Package
- Model

Each variant maintains:

- SKU
- Barcode
- Inventory
- Price adjustments
- Images

---

## Product Attributes

Examples:

- CPU
- RAM
- Storage
- GPU
- Display
- Ports
- Connectivity
- Power
- Material
- Compatibility

Attributes must be configurable without requiring code changes.

---

## Media

Supported media:

Images

- JPG
- PNG
- WEBP

Videos

- MP4

Media Features

- Multiple images
- Multiple videos
- Thumbnail generation
- Watermarking
- Image optimization
- Video preview

---

## Product Conditions

The platform shall support:

- New
- Open Box
- Refurbished
- Used
- Stock Clearance

Condition badges must be displayed prominently.

---

## Related Products

Products may reference:

- Similar products
- Accessories
- Frequently bought together
- Replacement products

---

# 7. User Stories

### CATALOG-US-001

As an Operator,

I want to create products,

so they become available for sale.

Acceptance Criteria

- Required fields validated.
- SKU unique.
- Slug generated automatically (editable).
- Product saved as Draft or Published.

---

### CATALOG-US-002

As a Customer,

I want to browse products by category,

so I can easily find relevant products.

Acceptance Criteria

- Category hierarchy displayed.
- Pagination supported.
- Empty categories handled gracefully.

---

### CATALOG-US-003

As a Customer,

I want to view complete product specifications,

so I can compare products before purchasing.

Acceptance Criteria

- Technical specifications displayed.
- Images load correctly.
- Videos are playable.
- Related products displayed.

---

### CATALOG-US-004

As an Operator,

I want to upload product images,

so products have professional presentation.

Acceptance Criteria

- Images validated.
- Watermark applied automatically.
- Optimized version generated.
- Thumbnail generated.

---

### CATALOG-US-005

As a Customer,

I want to clearly see whether a product is New, Refurbished, or Open Box,

so I understand its condition before buying.

Acceptance Criteria

- Product condition displayed on listing and details pages.
- Condition included in search filters.

---

# 8. API Endpoints

Public

GET /products

GET /products/{slug}

GET /products/search

GET /products/featured

GET /products/latest

GET /products/stock

GET /categories

GET /brands

Administration

POST /admin/products

PATCH /admin/products/{id}

DELETE /admin/products/{id}

POST /admin/products/{id}/publish

POST /admin/products/{id}/archive

POST /admin/products/{id}/media

POST /admin/products/{id}/variants

POST /admin/categories

POST /admin/brands

---

# 9. Validation Rules

Product Name

- Required
- Maximum 255 characters

SKU

- Required
- Unique

Slug

- Required
- Unique

Category

- Required

Brand

- Required

Images

- Minimum one primary image

Videos

- Optional

Warranty

- Optional

Condition

- Required

---

# 10. Search & Filtering

Customers shall be able to filter by:

- Category
- Brand
- Price
- Availability
- Product condition
- Warranty
- Rating (future)
- Discount (future)

Sorting

- Newest
- Price: Low to High
- Price: High to Low
- Best Selling
- Most Viewed (future)
- Alphabetical

---

# 11. SEO Requirements

Each product shall have:

- SEO title
- Meta description
- Canonical URL
- Open Graph metadata
- Structured data (Schema.org Product)

Category and brand pages shall also support SEO metadata.

---

# 12. Authorization

Guest

- Browse catalog

Customer

- Browse catalog

Partner

- Browse catalog
- View partner pricing (after Pricing Engine evaluation)

Operator

- Create products
- Edit products
- Archive products
- Upload media

Super Administrator

- Full catalog administration

---

# 13. Audit Events

The system shall record:

- Product creation
- Product updates
- Product publication
- Product archival
- Category changes
- Brand changes
- Media uploads
- Variant creation
- Attribute updates

---

# 14. Dependencies

Requires:

- Authentication & Identity
- Media Service
- Inventory
- Pricing Engine

Provides services to:

- Search
- Orders
- Checkout
- SEO
- Torob Integration
- Reporting

---

# 15. Test Scenarios

Positive Tests

- Create category
- Create brand
- Create product
- Upload images
- Upload videos
- Publish product
- Archive product
- Create variant
- Display product page

Negative Tests

- Duplicate SKU
- Duplicate slug
- Missing required category
- Invalid media type
- Missing primary image
- Invalid product condition
- Unauthorized product modification

---

# 16. Definition of Done

The Product Catalog module is complete when:

- Categories, brands, products, and variants can be managed.
- Media uploads and watermarking work correctly.
- Products support SEO metadata.
- Product lifecycle states function correctly.
- Product condition is displayed consistently.
- Search and filtering operate as specified.
- Unit, integration, and user acceptance tests pass.
- The module is approved during the Milestone 1 review.