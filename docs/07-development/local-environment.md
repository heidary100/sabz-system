# Sabz System Platform
# Local Environment Setup

Version: 1.1

---

# Overview

This document provides detailed instructions for setting up the local development environment on the host, including how environment variables are owned and loaded.

If you prefer a fully containerized setup, use the [Docker Development Environment](development-environment.md) instead — it starts the whole stack with a single command and needs no local Node.js, PostgreSQL, or Redis.

---

# System Requirements

| Tool | Version | Purpose |
|------|---------|--------|
| Node.js | 20+ | Runtime |
| pnpm | 11+ (see root `package.json` `packageManager`) | Package manager |
| Docker | 24+ | Container runtime |
| Docker Compose | 2.20+ | Multi-container orchestration |
| Git | 2.40+ | Version control |

---

# Docker Services

The project uses Docker Compose for the local infrastructure (PostgreSQL and Redis). The complete stack — including the API, Admin, and Storefront application containers — is defined in `docker-compose.yml` at the repository root:

```yaml
# docker-compose.yml (infrastructure services)
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: sabz
      POSTGRES_USER: sabz
      POSTGRES_PASSWORD: sabz
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

All values are safe local-development defaults and can be overridden via a root `.env` file (see below).

---

# Environment Variables

## The environment contract

The repository's single development environment contract is the root [`.env.example`](../../.env.example). It documents **every** variable the monorepo consumes, which application owns each variable, and which values are safe defaults versus must-supplied.

Ownership summary:

| Variable | Owner | Loaded from (host dev) | Loaded from (Docker Compose) |
|----------|-------|------------------------|------------------------------|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Infrastructure (Compose) | root `.env` interpolation | root `.env` interpolation |
| `DATABASE_URL` | API | `apps/api/.env` | derived in Compose from the `POSTGRES_*` variables |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | API | `apps/api/.env` | Compose `environment:` block |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | API | `apps/api/.env` | Compose `environment:` block |
| `CORS_ORIGINS` | API | `apps/api/.env` | Compose `environment:` block |
| `THROTTLE_TTL_MS`, `THROTTLE_LIMIT` | API | `apps/api/.env` (or code defaults) | Compose `environment:` block |
| `DEV_ADMIN_MOBILE` | API (seed) | `apps/api/.env` | Compose `environment:` block |
| `DOCUMENT_STORAGE_DRIVER`, `DOCUMENT_STORAGE_DIR` | API | `apps/api/.env` (or code defaults) | Compose `environment:` block (`DOCUMENT_STORAGE_DIR` pinned to `/app/.data/documents`, backed by the `api_documents` volume) |
| `PRODUCT_MEDIA_STORAGE_DRIVER`, `PRODUCT_MEDIA_STORAGE_DIR` | API | `apps/api/.env` (or code defaults) | Compose `environment:` block (`PRODUCT_MEDIA_STORAGE_DIR` pinned to `/app/.data/product-media`, backed by the `api_product_media` volume) |
| `PORT`, `NODE_ENV` | API | `apps/api/.env` | Pinned by Compose |
| `VITE_API_BASE_URL` | Admin | `apps/admin/.env` | Compose `environment:` block |
| `NEXT_PUBLIC_API_BASE_URL` | Storefront | `apps/storefront/.env.local` | Not set; code fallback applies |

## How environment variables are loaded

A root `.env` file is read **only by Docker Compose** for `${VAR}` interpolation inside `docker-compose.yml`. The application frameworks do not read it when running on the host:

| Runtime | Reads | Example file |
|---------|-------|--------------|
| NestJS (`@nestjs/config`) | `apps/api/.env` | `apps/api/.env.example` |
| Vite (inlines `VITE_*` at build time) | `apps/admin/.env` | `apps/admin/.env.example` |
| Next.js (inlines `NEXT_PUBLIC_*` at build time) | `apps/storefront/.env.local` etc. | `apps/storefront/.env.example` |
| Prisma CLI (`prisma migrate`, `db seed`) | `DATABASE_URL` from the package environment | `apps/api/.env.example` |

Framework build-time variables (`VITE_*`, `NEXT_PUBLIC_*`) must remain application-specific: Vite and Next.js inline them at build time and never read a repository-root `.env`.

## Setting up environment files

```bash
# Optional: root .env for Docker Compose overrides (defaults work without it)
cp .env.example .env

# API (required for host-native development)
cp apps/api/.env.example apps/api/.env

# Admin (only if you need to override the dev-server proxy)
cp apps/admin/.env.example apps/admin/.env

# Storefront (only if you need to override the API base URL)
cp apps/storefront/.env.example apps/storefront/.env.local
```

## Safe defaults vs must-supplied values

All values in `.env.example` files are safe local-development defaults. The following **must** be overridden outside local development:

- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — long random strings; the committed placeholders are development-only.
- `POSTGRES_PASSWORD` / `DATABASE_URL` — local-only credentials.
- `CORS_ORIGINS` — list the real browser origins.
- `DEV_ADMIN_MOBILE` — development-only; the seed refuses to run unless `NODE_ENV=development`.

Never commit `.env` files (they are git-ignored) and never use the development placeholders in production.

---

# Document Storage

Business document metadata lives in PostgreSQL (`BusinessDocument`); the binary
contents are stored through the Partner-domain `DocumentStorage` abstraction
(`DOCUMENT_STORAGE_DRIVER=local`, SS-038).

- Host-native development: files are written under `DOCUMENT_STORAGE_DIR`
  (default `.data/documents`), resolved relative to the API package directory
  (`apps/api/.data/documents`). The `.data/` directory is git-ignored.
- Docker Compose: `DOCUMENT_STORAGE_DIR` is pinned to `/app/.data/documents`
  and backed by the `api_documents` named volume, so documents persist across
  container restarts. `docker compose down -v` deletes them.

---

# Product Media Storage (SS-105)

Product media metadata lives in PostgreSQL (`ProductMedia`); the binary contents
are stored through the Product-domain `ProductMediaStorage` abstraction
(`PRODUCT_MEDIA_STORAGE_DRIVER=local`, SS-105). This is separate from the
Partner `DocumentStorage`.

- Host-native development: files are written under `PRODUCT_MEDIA_STORAGE_DIR`
  (default `.data/product-media`), resolved relative to the API package
  directory (`apps/api/.data/product-media`). The `.data/` directory is
  git-ignored.
- Docker Compose: `PRODUCT_MEDIA_STORAGE_DIR` is pinned to
  `/app/.data/product-media` and backed by the `api_product_media` named
  volume, so media persists across container restarts. `docker compose down -v`
  deletes them.

---

# Testing

## Unit tests

```bash
pnpm test
```

Runs the API unit specs (Jest) across the monorepo. No infrastructure required.

## E2E tests

The E2E suite (`apps/api/test/*.e2e-spec.ts`) boots the Nest application, which
connects to PostgreSQL and Redis, and covers the security middleware (security
headers, CSP, rate limiting, trust proxy) and app bootstrap:

```bash
docker compose up -d postgres redis
DATABASE_URL="postgresql://sabz:sabz@localhost:5432/sabz?schema=public" \
REDIS_HOST=localhost REDIS_PORT=6379 NODE_ENV=test \
JWT_ACCESS_SECRET="dev_access_secret_change_me" \
JWT_REFRESH_SECRET="dev_refresh_secret_change_me" \
pnpm --filter @sabz/api test:e2e
```

The JWT variables are required because the app bootstraps the full Nest
application (which calls `getOrThrow` on both secrets). If `apps/api/.env`
already contains them, the inline values are redundant but harmless.

## Integration tests (database-backed)

Real-database specs run against the migrated PostgreSQL database using the
dedicated `test/jest-integration.json` config (files matching
`.integration-spec.ts`). The same services and environment as the E2E suite are
required:

```bash
docker compose up -d postgres redis
DATABASE_URL="postgresql://sabz:sabz@localhost:5432/sabz?schema=public" \
REDIS_HOST=localhost REDIS_PORT=6379 NODE_ENV=test \
JWT_ACCESS_SECRET="dev_access_secret_change_me" \
JWT_REFRESH_SECRET="dev_refresh_secret_change_me" \
pnpm --filter @sabz/api test:integration
```

Integration specs must clean up any rows they create.

`NODE_ENV=test` keeps Swagger enabled so the E2E suite can assert on
`/api/docs`; the deterministic development OTP (`123456`) is only active under
`NODE_ENV=development`.

---

# Common Issues

## Port Already in Use

```bash
# Find and kill process on port 3000
lsof -i :3000
kill -9 <PID>
```

## Database Connection Errors

```bash
# Check if PostgreSQL is running
docker compose ps

# Restart PostgreSQL
docker compose restart postgres

# Reset database (WARNING: deletes all data, media and documents)
docker compose down -v
docker compose up -d --build
```

## Prisma Client Issues

```bash
# Regenerate Prisma client
cd apps/api
npx prisma generate
```

---

# Development Seed Data

Seed the four application roles (CUSTOMER, PARTNER, OPERATOR, ADMIN) and one
development admin user:

```bash
pnpm --filter @sabz/api prisma:seed
```

Or from the repository root:

```bash
pnpm seed
```

In the Docker development environment this is automatic: the API container
runs `prisma:seed` at every startup, after `prisma migrate deploy`. The seed
is idempotent and safe to run repeatedly. It requires
`DEV_ADMIN_MOBILE` (a valid Iranian mobile number) and refuses to run when
`NODE_ENV` is not `development`. Note that `prisma migrate dev` also runs the
seed automatically after applying migrations, so `DEV_ADMIN_MOBILE` must be
set in any environment where migrations are applied.

Example:

```env
DEV_ADMIN_MOBILE=+989170000001
```

The development admin is created ACTIVE with the ADMIN role and profile data,
so the admin authentication flow can be tested end-to-end.

## Development OTP

In development only (`NODE_ENV=development`), the OTP code is always
`123456`. The code is still stored and verified through the normal OTP path;
the deterministic code is hard-coded and cannot be enabled in production via
any environment variable.
