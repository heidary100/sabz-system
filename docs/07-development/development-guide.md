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

# Available Scripts

```bash
pnpm lint          # Lint all packages
pnpm typecheck     # Type check all packages
pnpm test          # Run all tests
pnpm build         # Build all packages
docker compose up  # Start infrastructure
```
