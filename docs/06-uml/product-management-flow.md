# Sabz System Platform
# Product Management Flow

Version: 1.0

---

# Product Lifecycle

```
DRAFT -> PUBLISHED -> ARCHIVED
  ^         |
  +---------+
```

# Product Creation Flow

## Step 1: Create Product

```
[Operator/Admin] -> POST /admin/products
    Request:
    - title (string)
    - description (text)
    - categoryId (UUID)
    - brandId (UUID)
    - sku (string)
    - specifications: [{ key, value }]
    - status: DRAFT

    -> [System] validates input
    -> [System] generates slug from title
    -> [System] creates Product record
    -> [System] creates ProductSpecification records
    -> Response: { id, title, slug, status: DRAFT }
```

## Step 2: Upload Media

```
[Operator/Admin] -> POST /admin/products/:id/media (multipart/form-data)
    - files (images/videos)
    - type (IMAGE | VIDEO)

    -> [System] uploads to S3 storage
    -> [System] applies watermark to images (if enabled)
    -> [System] creates ProductMedia records
    -> [System] updates product media order
```

## Step 3: Set Inventory

```
[Operator/Admin] -> POST /admin/products/:id/inventory
    Request:
    - warehouseId (UUID)
    - quantity (int)

    -> [System] creates or updates Inventory record
    -> [System] sets stock status based on quantity
```

## Step 4: Publish

```
[Operator/Admin] -> PATCH /admin/products/:id/status
    Request:
    - status: PUBLISHED

    -> [System] validates product has required fields
    -> [System] validates product has at least one image
    -> [System] validates inventory is set
    -> [System] updates product status
    -> [System] clears product cache in Redis
```

---

# Category Management

```
[Admin] -> POST /admin/categories
    - name, slug, parentId (optional), sortOrder

-> Categories support infinite nesting via parentId
-> Slug is auto-generated from name if not provided
```

# Brand Management

```
[Admin] -> POST /admin/brands
    - name, slug, logo (file)

-> Brand slugs are unique
-> Logo is uploaded to S3 storage
```

# Holo Data Migration

```
[Admin] -> POST /admin/migrations/holo/import
    -> [System] reads product data from Holo API
    -> [System] maps Holo categories to platform categories
    -> [System] creates Product, Category, Brand records
    -> [System] imports product images
    -> [System] sets initial inventory levels
    -> [System] generates import report
```
