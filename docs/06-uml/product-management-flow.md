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
    - brandId (UUID, optional — products may be unbranded)
    - specifications: [{ key, value }]
    - status: DRAFT

    Note: SKUs live on ProductVariant, not on Product — a simple product
    carries its SKU on its single variant; variable products carry one SKU
    per variation.

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

    -> [System] stores binaries through the local-disk product-media
       storage driver (object storage is future work)
    -> [System] applies watermark to images/videos (if enabled)
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
    -> [System] invalidates the storefront catalog cache by POSTing the
       affected cache tags to the storefront's /api/revalidate endpoint
       (SS-217; authenticated by a shared token, not Redis)
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
    - name, slug

-> Brand slugs are unique
-> Brand logo upload is not implemented yet (the schema has a nullable
   Brand.logoKey reserved for future use; the product watermark instead
   uses the centralized brand asset — see
   apps/storefront/public/brand/README.md)
```

# Catalog Data Import

The current production source is **WooCommerce** (per ADR-004). The import
runs as repeatable CLI scripts with dry-run, resume and reporting — see the
[import runbook](../07-development/import-runbook.md) and the
[field mapping](../04-database/woo-import-mapping.md).

```
[Operator] -> pnpm --filter @sabz/api woo:dry-run -- --file <export.csv>
[Operator] -> pnpm --filter @sabz/api woo:import  -- --file <export.csv>
[Operator] -> pnpm --filter @sabz/api woo:media   -- --file <export.csv>
    -> [System] parses the WooCommerce CSV export
    -> [System] maps Woo categories/brands/attributes to platform records
    -> [System] upserts Product, ProductVariant, Category, Brand records
    -> [System] imports product images through the watermark pipeline
    -> [System] records inventory receipts on the DEFAULT warehouse
    -> [System] writes the import report (ImportRun/ImportRecord)
```

A Holo import adapter remains a possible future source (the source-identity
model is source-agnostic: `sourceSystem`/`sourceId`); no Holo integration
exists today.
