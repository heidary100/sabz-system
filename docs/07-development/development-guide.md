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

---

# Available Scripts

```bash
pnpm lint          # Lint all packages
pnpm typecheck     # Type check all packages
pnpm test          # Run all tests
pnpm build         # Build all packages
docker compose up  # Start infrastructure
```
