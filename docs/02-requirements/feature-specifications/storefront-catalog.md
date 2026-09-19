# Sabz System Platform
# Feature Specification – Storefront Catalog

Version: 1.0

Module ID: STORE-001

Status: Approved for Development

Milestone: 2

Priority: Critical (P1)

Contract source: `docs/01-planning/milestone-2-plan.md` (approved) and the
shared types in `packages/types/src/catalog/catalog.ts` (SS-119).

---

# 1. Purpose

The Storefront Catalog delivers the customer-facing product catalog of the Sabz
System platform: category navigation, product listing with filtering/sorting,
product detail with media, and a real home page. It consumes the existing
Milestone 1 catalog domain (products, categories, brands, media, inventory)
through a new public, read-only `/catalog/*` API.

The catalog is Persian-first and RTL. All prices are displayed in **Toman**.

---

# 2. Goals

- Let a guest browse the complete published catalog without an account.
- Serve every product image/video from the server-side watermarked assets.
- Reflect real availability from the inventory read aggregate (SS-112).
- Present the complete storefront UI from day one; surfaces whose
  functionality comes later (cart, checkout, orders, account) render real UI
  with explicit Persian empty/placeholder states.

---

# 3. Actors

- Guest (primary; no authentication)
- Customer / Partner (same read surface; personalized pricing is explicitly
  deferred to a later milestone)

---

# 4. Business Rules

### STORE-001

Only products with `status = PUBLISHED` and no soft-delete are visible
anywhere in the storefront.

### STORE-002

Only categories with `isVisible = true` and no soft-delete appear in
navigation and category pages.

### STORE-003

Every price is displayed in Toman with Persian (`fa-IR`) numerals.

### STORE-004

Listing cards show the minimum variant price (`priceFrom`) of the product.

### STORE-005

Availability is derived exclusively from the inventory read aggregate
(active warehouses, `quantityOnHand − quantityReserved`); the legacy
`stockQuantity` column is never used.

### STORE-006

Every displayed product image/video is the stored watermarked asset, served
by the public media endpoint with immutable caching.

### STORE-007

Product long descriptions are the API-sanitized rich-text HTML and are
rendered only through the storefront `RichText` component.

### STORE-008

Archived, draft, soft-deleted products and hidden categories respond with
404 (they are never rendered, filtered out client-side, or listed).

### STORE-009

The complete storefront chrome (header, category navigation, search entry,
cart icon, account icon, footer) exists from the first storefront release;
non-functional destinations route to explicit placeholder pages.

---

# 5. Functional Requirements

## 5.1 Navigation and shell

- Sticky header: brand logo, root-category navigation (with
  `publishedProductCount` badges), search entry, cart icon (badge shows an
  empty/zero state until the cart milestone), account icon (placeholder).
- Mobile drawer navigation, RTL-correct.
- Footer with company info, category links, and static pages links
  (placeholder routes).

## 5.2 Home page

- Hero section, featured categories (from the category tree), latest
  published products (`sort=newest`).

## 5.3 Product listing

- Routes: `/products`, `/categories/[slug]`.
- URL search params are the single source of truth:
  `?q=&category=&brand=&condition=&sort=&page=`.
- Filters: category, brand, condition; search over product names; sort:
  newest (default), price ascending/descending, name.
- Pagination with the shared `PaginatedResult` envelope.
- Card: primary thumbnail (fallback: original image), name, brand,
  `priceFrom`, availability badge. Explicit empty state when no results.

## 5.4 Product detail

- Route: `/products/[slug]`; `generateMetadata` for title/OG.
- Gallery: ordered media (primary first), images and video playback.
- Variant display with per-variant price and availability.
- Breadcrumb of the category ancestry chain.
- Sanitized rich-text description, dimensions/warranty/origin when present.
- 404 for any non-public product.

## 5.5 Cart placeholder

- Route `/cart` renders the shopping-cart UI with an explicit Persian empty
  state; no cart functionality exists in this milestone.

---

# 6. Non-Functional Requirements

- All pages render server-first (Next.js App Router server components) with
  client components only for interactive controls.
- Images use `next/image` with `remotePatterns` (or a same-origin rewrite
  proxy) sized from thumbnails where available.
- Persian/RTL throughout; LTR islands (SKUs, numbers) wrapped explicitly.
- No client-side business logic duplication: filtering/sorting/pagination
  semantics live in the API.

---

# 7. Dependencies

- CATALOG domain (products, categories, brands, media) — Milestone 1.
- Inventory read aggregate (SS-112).
- Public catalog API (SS-120–SS-123).
- Design source: `docs/assets/ecommerce-v4.zip` (Tailwind Plus Ecommerce v4).

---

# 8. Out of Scope

Cart functionality, checkout, orders, payments, customer/partner
authentication, personalized (tier) pricing, reviews, wishlist, advanced
search (FTS/Elasticsearch), promotions.
