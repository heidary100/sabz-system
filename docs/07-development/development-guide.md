# Sabz System Platform
# Development Guide

Version: 1.0

---

# Overview

This guide covers the local development environment setup and day-to-day development practices for the Sabz System Platform.

---

# Prerequisites

- Node.js 20+
- pnpm 8+
- Docker and Docker Compose
- PostgreSQL 15+
- Git

---

# Getting Started

## 1. Clone the Repository

```bash
git clone <repository-url>
cd sabz-system
```

## 2. Install Dependencies

```bash
pnpm install
```

## 3. Setup Environment

```bash
cp apps/api/.env.example apps/api/.env
# Edit .env with your local configuration
```

> The repository's full environment contract (every variable, its owning
> application, and safe defaults) is documented in the root `.env.example`.
> Copy it to `.env` only if you need to override Docker Compose defaults —
> the Compose defaults work without it.

## 4. Start Infrastructure Services

```bash
docker compose up -d postgres
```

## 5. Run Database Migrations

```bash
pnpm --filter @sabz/api prisma:migrate
pnpm --filter @sabz/api prisma:generate
```

> Note: `prisma generate` also runs automatically as part of Turbo's build, typecheck, test, and dev pipelines.

## 6. Seed Development Data

```bash
npx prisma db seed
```

## 7. Start Development Servers

```bash
# Start API (NestJS)
cd apps/api
pnpm dev:start

# Start Storefront (Next.js)
cd apps/storefront
pnpm dev

# Start Admin (React)
cd apps/admin
pnpm dev
```

---

# Project Structure

```
sabz-system/
├── apps/
│   ├── api/              # NestJS backend
│   │   ├── src/
│   │   │   ├── modules/  # Business modules
│   │   │   ├── common/   # Shared utilities
│   │   │   └── config/   # Configuration
│   │   └── prisma/       # Database schema & migrations
│   ├── storefront/        # Next.js B2C/B2B storefront
│   └── admin/             # React admin dashboard
├── packages/              # Shared packages
│   ├── types/             # Shared TypeScript types
│   └── ui/                # Shared UI components
├── docs/                  # Project documentation
├── scripts/               # Utility scripts
├── AGENTS.md              # AI development instructions
└── README.md
```

# Shared Packages

Code shared between applications lives under `packages/` and is consumed as
`workspace:*` dependencies.

- `packages/types` (`@sabz/types`) — shared wire contracts for the API
  (request/response payloads, enums, error payloads). Types only; no runtime
  behavior.
- `packages/api-client` (`@sabz/api-client`) — framework-agnostic HTTP client
  foundation consumed by Admin and Storefront: `ApiError`, `createApiClient`
  (base URL, credentials, default headers), and a generic `request<T>`.
  Transport-level concerns only.

Rules:

- Applications configure the client with their own base URL
  (`VITE_API_BASE_URL` in Admin, `NEXT_PUBLIC_API_BASE_URL` in Storefront).
- Authentication-specific behavior (token storage, refresh coordination,
  logout, auth state) stays in the consuming application — it is never added
  to `@sabz/api-client`.
- Business/domain logic is not placed in shared packages.

---

# Admin Routing Conventions

The admin application (`apps/admin`) is Persian-first, RTL, and uses the Sabz
palette (`apps/admin/src/index.css`). Conventions established by SS-041:

- Routes are declared in `apps/admin/src/app/App.tsx` as children of the
  `RequireAuth` layout route and are wrapped in `RequireRole roles={ADMIN_ROLES}`
  (`['OPERATOR', 'ADMIN']`). Frontend role gating is UX only — the API remains
  the authorization boundary.
- Sidebar navigation lives in `apps/admin/src/layouts/admin-layout.tsx`; new
  entries are added to the `NAV_ITEMS` array with a Persian label.
- API calls go through the `request()`/`requestBlob()` wrappers in
  `apps/admin/src/services/api.ts` so bearer injection, single-flight refresh,
  retry, and session clearing stay centralized.
- Domain services live under `apps/admin/src/services/` (e.g. `partners.ts`)
  and reuse `@sabz/types` contracts; pages/components never call `fetch`
  directly.
- Dates use native Jalali formatting (`apps/admin/src/lib/format.ts`); no
  calendar dependency is required.
- Partner review UI (SS-041): `/partners` lists applications with status filter
  and pagination; `/partners/:id` shows business info, documents, and
  approve/reject/tier-change actions. Documents are previewed/downloaded through
  the authenticated `requestBlob` flow — never via public storage URLs.

## Admin User Management UI (SS-066)

The admin user-management UI builds on the SS-061/062/063 read + lifecycle +
role-administration APIs. As with all admin frontend, role gating is UX only —
the SS-061/062/063 APIs remain the authorization boundary.

- `/users` (`UsersPage`, `RequireRole roles={ADMIN_ROLES}`): user list with
  search (mobile / first name / last name, debounced ~300ms), status filter,
  role filter, and pagination. Row click opens `/users/:id`.
- `/users/:id` (`UserDetailPage`): identity, profile, roles, and partner
  sections plus lifecycle actions derived from account status. Suspend
  (optional reason, max 500 chars) and unsuspend are available to `OPERATOR`
  and `ADMIN`; unlock is `ADMIN` only. Role assignment and role removal are
  `ADMIN` only. The `ADMIN` role has no removal path and self-role modification
  is disabled client-side (backend still rejects it). On a `409` the affected
  user/list is refetched so the UI never keeps stale state.
- `/roles` (`RolesPage`, `RequireRole roles={['ADMIN']}`): read-only role
  catalog (name, description, permissions). No CRUD. The `نقش‌ها` sidebar item
  is hidden for `OPERATOR`, but the route remains server- and route-gated for
  `ADMIN`.
- User details are held in React memory only — never persisted to
  localStorage/sessionStorage/IndexedDB.
- New services `users.ts` and `roles.ts` reuse `request()`; labels live in
  `lib/user-labels.ts`; dialogs under `components/users/`.

Manual acceptance: see the SS-066 checklist in the issue (search, filters,
pagination, lifecycle transitions, role assignment/removal, `409`/`403`
handling, `/roles` ADMIN-only, RTL/Persian, loading/empty/error states).

## Admin Audit Viewer UI (SS-067)

The admin audit viewer builds on the SS-064 read-only audit query API
(`GET /admin/audit`). As with all admin frontend, role gating is UX only —
the SS-064 API remains the authorization and data-access boundary.

- `/audit` (`AuditPage`, `RequireRole roles={ADMIN_ROLES}`): read-only,
  paginated audit log with filters. Sidebar label: «گزارش فعالیت‌ها».
- Filters map 1:1 to the SS-064 query contract: actor (`actorId`, exact UUID
  input — no name/mobile search by design), action (Select of known actions),
  entity (Select of known entities), entity ID (UUID input), from/to date range
  (native date inputs, converted to local-time day boundaries and sent as ISO
  UTC strings). All filters buffer behind the «اعمال فیلتر» (Apply) button.
  Invalid UUIDs and `from > to` are blocked client-side; unknown future
  actions/entities still render via a raw-value fallback.
- Read-only: no mutations, no audit editing/deletion/export. No client-side
  fuzzy filtering — the backend owns query semantics.
- Table shows date/time (Jalali), actor (name/mobile, «سیستم/ناشناس» fallback
  for missing actors), action/entity Persian labels, entity ID, and a
  «مشاهده» action. IP address appears only in the details dialog.
- Before/after are shown as a structured, sanitized key/value view in an
  expandable dialog (`AuditDetailsDialog`) — never raw JSON blobs in the table.
  Client-side key sanitization is defense-in-depth only; the backend write-time
  policy remains authoritative. No `dangerouslySetInnerHTML`.
- Audit data lives in React memory only — never persisted to
  localStorage/sessionStorage/IndexedDB, and never logged to the console.
- New `services/audit.ts` reuses `request()`; state hook `use-audit-log.ts`;
  labels in `lib/audit-labels.ts`; sanitizer in `lib/audit-sanitize.ts`.

Manual acceptance: see the SS-067 checklist in the issue (ADMIN/OPERATOR
access, pagination, each filter, combined filters, clear/reset, empty/error +
retry, Jalali dates, missing-actor fallback, Persian labels, sanitized
before/after, no secrets, IP in dialog only, 401 refresh, RTL/pagination
direction, no persistence, no console logging).

## Admin Dashboard UI (SS-068)

The admin dashboard builds on the SS-065 read-only operational snapshot API
(`GET /admin/dashboard`, `OPERATOR`/`ADMIN` only). As with all admin frontend,
role gating is UX only — the SS-065 API remains the authorization and
data-access boundary.

- `/dashboard` (`DashboardPage`, `RequireRole roles={ADMIN_ROLES}`): a compact
  operational snapshot. Sidebar label: «پیشخوان».
- Major sections: user statistics (total / active / suspended / locked /
  pending-OTP), role distribution (assigned roles regardless of account
  status), partner lifecycle funnel (draft / pending / approved / rejected —
  a current-state snapshot, not a time-series), recent partner applications
  (max 5, rows link to `/partners/:id`), and recent audit activity (max 8,
  actor/action/entity only — no before/after, no IP).
- Data source of truth is `GET /admin/dashboard`; the page performs no
  client-side metric computation. A manual «به‌روزرسانی» button refetches;
  there is no polling or auto-refresh.
- Dashboard data lives in React memory only — never persisted to
  localStorage/sessionStorage/IndexedDB, and never logged to the console.
- New `services/dashboard.ts` reuses `request()`; state hook
  `use-dashboard.ts`; dashboard-local `StatCard` primitive and recent-list
  components under `components/dashboard/`; labels/badges/format helpers are
  reused from `lib/` and the partner/user/audit components.

Manual acceptance: see the SS-068 checklist in the issue (ADMIN/OPERATOR
access, all metric blocks, partner badge consistency, partner row navigation,
view-all links, audit labels, missing-actor fallback, empty recent lists,
loading/error/retry, 401 refresh, 403 message, refresh button, RTL/Persian,
no persistence, no console logging).


---

# SS-106 — Admin Product & Catalog UI

Access: OPERATOR + ADMIN (`RequireRole roles={ADMIN_ROLES}`). No
`SUPER_ADMIN`, no `@Permissions`.

Routes (sidebar: محصولات، دسته‌بندی‌ها، برندها):

- `/products` (`ProductsPage`): paginated list with search, status /
  category / brand filters, loading / empty / error+retry, row navigation to
  detail, and a create dialog.
- `/products/:id` (`ProductDetailPage`): business info, lifecycle actions,
  and read-only Variant + Media sections.
- `/categories` (`CategoriesPage`): paginated list with create / edit /
  delete dialogs; parent column and parent select (self-parent prevented in
  the UI; the backend remains authoritative for descendant cycles via 409).
- `/brands` (`BrandsPage`): paginated list with create / edit / delete
  dialogs.

Product lifecycle (backend-authoritative, never optimistic):

- DRAFT: Edit, Publish. PUBLISHED: Edit, Archive. ARCHIVED: Delete only;
  editing is blocked by the backend (409) and the UI hides edit/publish/
  archive. Publishing a DRAFT with no variant returns 409.
- Lifecycle actions call `POST /admin/products/:id/publish`,
  `POST /admin/products/:id/archive`, `DELETE /admin/products/:id`. On 409
  the UI shows the Persian backend message and refetches the authoritative
  detail.

Ownership boundaries:

- **Variants** are read-only in SS-106 (SKU / name / barcode / price /
  stock displayed with a note that these belong to the variant). Variant
  CRUD/inventory belongs to SS-107.
- **Media** are read-only metadata in SS-106. Upload/delete/reorder/download
  belong to SS-108 (media preview is intentionally not surfaced here).
- Product create/edit uses Catalyst dialogs; forms never expose product
  SKU/price/stock, status selection, or variant/media management.

Implementation notes:

- New services `services/products.ts`, `services/categories.ts`,
  `services/brands.ts` map 1:1 to the SS-102/103 admin endpoints using the
  existing `request()` wrapper.
- Plain React hooks (`use-product-list.ts`, `use-product-detail.ts`,
  `use-category-list.ts`, `use-brand-list.ts`, plus option hooks) follow the
  existing `requestSeq` stale-response protection, page-reset-on-filter, and
  page-clamp conventions. No new state-management library.
- Category/brand option lists (product filters, product form selects,
  category parent select) fetch page 1 with `limit=100` because the
  category/brand list endpoints expose no search — this is a documented
  limitation for M1.
- Labels live in `lib/product-labels.ts`; `ProductStatusBadge` follows the
  existing badge convention. Dates reuse the Jalali helpers; prices are
  strings from the API and are displayed without arithmetic.
- `isFeatured` on brands is intentionally **not** exposed/mutated in SS-106;
  it is deferred until its product/media requirements are scoped.

Manual acceptance is the established convention (no React test harness); see
the SS-106 issue checklist covering role access, filters, pagination,
lifecycle 409 refresh, category hierarchy/self-parent, delete-blocked 409s,
read-only variant/media, no storageKey/logoKey leakage, refresh, and
RTL/Persian.

---

# SS-107 — Admin Product Variant & Minimal Inventory UI

Access: OPERATOR + ADMIN (`RequireRole roles={ADMIN_ROLES}`). No
`SUPER_ADMIN`, no `@Permissions`. As with all admin frontend, role gating is UX
only — the SS-104 API remains the authorization and data-access boundary.

Route: no new route. Variant management lives inside `/products/:id`
(`ProductDetailPage`); there is no standalone variant sidebar item because
variants are product-scoped.

Surface:

- The SS-106 read-only variant section is evolved into an actionable
  management surface: «افزودن واریانت» button plus per-row «ویرایش» /
  «موجودی» / «حذف» actions that open Catalyst dialogs.
- `VariantForm` (single reusable dialog) handles create and edit:
  SKU (required, `ltr`, max 64), barcode (optional, nullable-clear), variant
  name/display label (optional, max 255 — no EAV/attributes in M1), retail
  price (required string, `^\d{1,10}(\.\d{1,2})?$`), and initial stock on
  create only.
- Stock is managed through the dedicated `VariantInventoryDialog`:
  `PATCH /admin/variants/:id/inventory` is an **absolute set** of
  `stockQuantity` (integer ≥ 0). Negative values are blocked client-side and
  the backend rejects them (400). No delta, no movement history, no warehouse,
  no reservation — those belong to EPIC-006.
- Availability is a derived presentation only (`0 → ناموجود`, `> 0 → موجود`);
  the API exposes only `stockQuantity` and no availability field.
- Delete is soft-delete (confirmation dialog, no hard-delete language, no
  restore UI). Deleting the only variant of a published product does not
  unpublish it.
- Prices are strings from the API and are never passed through floating-point
  arithmetic; no currency engine or symbol is introduced.

Lifecycle (backend-authoritative, never optimistic):

- DRAFT / PUBLISHED products: full variant management.
- ARCHIVED products: the variant table stays read-only (create/edit/stock/
  delete controls are hidden); the backend still rejects mutations with 409.
- After every mutation the variant list and product detail are refetched. On a
  409 (duplicate SKU, archived product, concurrent archive/soft-delete race)
  the Persian backend message is shown via `translateApiError()` and both
  fetches are refreshed so the UI never keeps stale state.
- Variant data lives in React memory only — never persisted to
  localStorage/sessionStorage/IndexedDB, and never logged to the console.
  Only shared-contract fields are rendered (never `deletedAt`/`createdBy`/
  `updatedBy`/storage keys).

Implementation notes:

- New `services/variants.ts` (`listVariants`, `createVariant`,
  `updateVariant`, `deleteVariant`, `setVariantInventory`) maps 1:1 to the
  SS-104 endpoints using the existing `request()` wrapper.
- New request-input contracts `CreateVariantInput` / `UpdateVariantInput` /
  `UpdateVariantInventoryInput` were added to `@sabz/types` following the
  existing shared-input convention (`CreateProductInput`, …). No new response
  types; `VariantSummary` (SS-101) is reused for every response.
- The variant table renders from the product-detail payload
  (`ProductDetail.variants`, authoritative non-deleted variant list), so no
  dedicated variant-list fetch or pagination is needed; every mutation
  refetches the product detail.
- Labels/formatting stay in the components; no new `lib/variant-labels.ts` is
  introduced. SKU/barcode/price/stock are rendered `dir="ltr"`.

Manual acceptance is the established convention (no React test harness); see
the SS-107 checklist in the issue (ADMIN/OPERATOR access, CUSTOMER/PARTNER
denied, variant CRUD, stock absolute-set + negative-blocked, availability
display, DRAFT/PUBLISHED/ARCHIVED lifecycle, duplicate-SKU 409 + refetch,
stale-race 409 + refetch, 404/401/403 handling, loading/empty/error+retry,
confirmation dialog, RTL/Persian, no sensitive fields, refresh reload).

---

# SS-108 — Admin Product Media UI

Access: OPERATOR + ADMIN (`RequireRole roles={ADMIN_ROLES}`). No
`SUPER_ADMIN`, no `@Permissions`. As with all admin frontend, role gating is UX
only — the SS-105 API remains the authorization and data-access boundary.

Route: no new route. Media management lives inside `/products/:id`
(`ProductDetailPage`); there is no standalone media sidebar item because media
are product-scoped.

Surface:

- The SS-106 read-only media section is evolved into an actionable surface:
  «افزودن رسانه» button plus per-row «مشاهده» / «دانلود» / «حذف» actions.
- Upload (`MediaUploadDialog`): the first Admin multipart upload. Sends
  `POST /admin/products/:productId/media` with `multipart/form-data` — required
  `file` and optional `variantId` only. `mediaType` is never sent (the backend
  infers it from content) and `isPrimary`/`sortOrder` are never sent (server
  controlled). Client-side validation (empty file, > 10 MB, unsupported browser
  MIME) is UX only; the backend stays authoritative for magic-byte validation,
  MIME mismatch, and size limits. No upload progress percentage — the transport
  is plain `fetch`.
- Preview (`MediaPreviewDialog`): authenticated `requestBlob` fetch +
  `URL.createObjectURL`. Images render in `<img>`, MP4 renders in
  `<video controls>`; object URLs are revoked on close. Download triggers a
  browser download using the sanitized `originalName`. No public URLs, no
  `storageKey`/path exposure.
- Delete (`MediaDeleteDialog`): `DELETE /admin/media/:id` soft-delete with
  confirmation; no restore, no hard delete.

Backend-controlled primary/order semantics (do not simulate in the UI):

- Ordering is server-controlled (`sortOrder`); there is no reorder endpoint and
  no drag-and-drop/move controls.
- The first uploaded IMAGE automatically becomes primary; videos are never
  primary; deleting the primary promotes the next image on the server. There is
  no "set primary" control and `isPrimary` is never mutated client-side.
- After every mutation (and on 409/404 conflicts) the product detail is
  refetched so the media section reflects authoritative server state.

Lifecycle (backend-authoritative, never optimistic):

- DRAFT / PUBLISHED products: full media management.
- ARCHIVED products: the media table stays read-only (upload/delete controls are
  hidden); viewing/download remain available.
- Media data lives in React memory only — never persisted to
  localStorage/sessionStorage/IndexedDB, and never logged to the console. Only
  shared-contract fields (`ProductMediaSummary`) are rendered.

Implementation notes:

- New `services/media.ts` (`uploadProductMedia`, `listProductMedia`,
  `downloadProductMedia`, `deleteProductMedia`) maps 1:1 to the SS-105
  endpoints. Upload uses the new `requestMultipart` helper in `services/api.ts`,
  which mirrors `request()`/`requestBlob()` bearer injection + single-flight
  refresh + retry + session clearing but never sets `Content-Type` (the browser
  generates the multipart boundary).
- The media section renders from `ProductDetail.media` (authoritative active
  media ordered by `sortOrder`); mutation/dialog state stays inside
  `ProductMediaSection` so the page only passes `media`, `variants`, `productId`,
  `manageable`, and the existing `refetch`.
- No `@sabz/types` change: `ProductMediaSummary` fully covers the response
  contract. No new dependencies, no test framework.

Manual acceptance is the established convention (no React test harness); see
the SS-108 checklist in the issue (OPERATOR/ADMIN access, CUSTOMER/PARTNER
denied, upload JPEG/PNG/WEBP/MP4, invalid/oversized/empty rejection, variant
association, first-image-primary, server ordering, no reorder/primary-toggle
controls, authenticated image/MP4 preview, download with original filename,
delete + primary promotion after refetch, 400/403/404/409 Persian messages,
401 refresh, no storageKey/public URL/path leakage, object URL revocation,
RTL/Persian/Vazirmatn, loading/empty/error states, refresh reload).

---

# SS-116 — Admin Warehouse UI

Access: ADMIN only (`RequireRole roles={['ADMIN']}`). No `SUPER_ADMIN`, no
`@Permissions`. As with all admin frontend, role gating is UX only — the SS-111
API remains the authorization and data-access boundary.

Route (sidebar: انبارها):

- `/warehouses` (`WarehousesPage`): paginated warehouse list with search
  (name/code, debounced ~300ms, max 100 chars) and status filter
  (همه / فعال / غیرفعال), loading / empty / error+retry states, and
  create/edit/activate/deactivate dialogs. The «انبارها» sidebar item is hidden
  for `OPERATOR`, but the route remains server- and route-gated for `ADMIN`.

Table columns are intentionally `کد / نام / وضعیت / عملیات` only:
`WarehouseSummary` (SS-111 list contract) deliberately excludes address/contact
fields. The backend is NOT modified to enrich the summary. On edit-open the UI
calls `GET /admin/warehouses/:id` and populates address/contact fields from
`WarehouseDetail`; the dialog shows a compact loading state during the fetch and
an error + «تلاش مجدد» on failure. No row navigation, no delete UI (SS-111 has
no delete endpoint).

Lifecycle (backend-authoritative, never optimistic):

- `WarehouseForm` (single reusable dialog) handles create and edit: کد
  (required, `ltr`, max 100), نام (required, max 255), آدرس (max 1000),
  نام مسئول (max 255), تلفن تماس (`ltr`, max 100). Create omits empty optional
  fields; edit sends `null` for cleared optionals per `UpdateWarehouseInput`.
  On duplicate-code 409 the Persian backend message is shown inside the dialog
  and the form input is preserved; the page refetches the authoritative list.
- `WarehouseStatusDialog` (single reusable Alert dialog) handles
  activate/deactivate with confirmation and submitting states
  («در حال فعالسازی…» / «در حال غیرفعالسازی…»). On 409 (non-ACTIVE/non-INACTIVE
  state change, or last-active-warehouse deactivation) the Persian backend
  message is shown via `translateApiError()` and the list is refetched. The
  last-active-warehouse invariant is entirely backend-owned — the UI never
  predicts or enforces it.
- After every successful mutation the list is refetched from the API. No
  optimistic badge/status changes.
- Warehouse data lives in React memory only — never persisted to
  localStorage/sessionStorage/IndexedDB, and never logged to the console. Only
  shared-contract fields (`WarehouseSummary`/`WarehouseDetail`) are rendered —
  never `deletedAt`/`createdBy`/`updatedBy`/internal DB fields. No stock,
  inventory, reservation, or movement UI in this issue.

Implementation notes:

- New `services/warehouses.ts` (`listWarehouses`, `getWarehouse`,
  `createWarehouse`, `updateWarehouse`, `activateWarehouse`,
  `deactivateWarehouse`) maps 1:1 to the SS-111 endpoints using the existing
  `request()` wrapper. No `@sabz/types` change and no new dependencies: the
  SS-110 contracts cover every request/response.
- `use-warehouse-list.ts` follows the existing `requestSeq` stale-response
  protection, page-reset-on-filter, and page-clamp conventions.
- Labels live in `lib/warehouse-labels.ts`; `WarehouseStatusBadge` (ACTIVE →
  green, INACTIVE → zinc) follows the existing badge convention. Errors reuse
  `translateApiError()`/`isConflictError()`; no new mappings were needed
  because SS-111 messages are already Persian and pass through verbatim.

Manual acceptance is the established convention (no React test harness); see
the SS-116 checklist in the issue (ADMIN access, OPERATOR/CUSTOMER/PARTNER
denied, list/search name/code/status filter/pagination, empty state, create,
duplicate-code 409 with preserved input, edit detail fetch + populate,
nullable-clear edit, activate, deactivate, last-active-warehouse 409 + refetch,
stale-status 409 + refetch, loading, error+retry, 401 refresh, RTL/Persian,
no persistence, no sensitive fields, no stock/reservation/movement UI,
refresh reload).

---

# Available Scripts

```bash
pnpm lint          # Lint all packages
pnpm typecheck     # Type check all packages
pnpm test          # Run all tests
pnpm build         # Build all packages
docker compose up  # Start infrastructure
```
