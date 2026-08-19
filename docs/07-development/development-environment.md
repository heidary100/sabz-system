# Sabz System Platform
# Docker Development Environment

Version: 1.0

---

# Overview

The project ships a complete local development environment built on Docker Compose. It runs all application services with hot reload alongside the infrastructure they depend on, so a full stack can be started with a single command.

Services:

| Service | Purpose | Host Port |
|---------|---------|-----------|
| postgres | PostgreSQL 16 database | 5432 |
| redis | Redis 7 cache | 6379 |
| api | NestJS API (`nest start --watch`) | 3000 |
| admin | React + Vite admin (`vite --host 0.0.0.0`) | 5173 |
| storefront | Next.js storefront (`next dev`) | 3002 |

Application source directories are bind-mounted into the containers, so edits on the host trigger hot reload inside the container. Container-installed `node_modules` are preserved in dedicated named volumes and are not affected by host dependencies.

---

# Prerequisites

- Docker 24+
- Docker Compose v2.20+ (included with Docker Desktop)
- Git
- `pnpm` 8+ on the host (only required for commands that must run outside the containers)

No local Node.js, PostgreSQL, or Redis installation is required.

---

# Getting Started

## 1. Clone the Repository

```bash
git clone <repository-url>
cd sabz-system
```

## 2. Start the Development Environment

```bash
docker compose up -d --build
```

On first run this builds the three application images and starts all five services. The API container generates the Prisma client and applies any pending database migrations before starting the dev server.

## 3. Verify Everything Is Running

```bash
docker compose ps
```

All services should report `running` and the infrastructure services `healthy`:

```text
NAME              IMAGE                      STATUS
sabz-postgres     postgres:16                Up ... (healthy)
sabz-redis        redis:7-alpine             Up ... (healthy)
sabz-api          sabz-system-api            Up ... (running)
sabz-admin        sabz-system-admin          Up ... (running)
sabz-storefront   sabz-system-storefront     Up ... (running)
```

Endpoints:

- API: http://localhost:3000/api/v1
- API Swagger docs: http://localhost:3000/docs
- Admin: http://localhost:5173
- Storefront: http://localhost:3002

## 4. View Logs

```bash
docker compose logs -f api
docker compose logs -f admin
docker compose logs -f storefront
```

---

# Everyday Commands

## Start

```bash
docker compose up -d
```

## Start Only Infrastructure

```bash
docker compose up -d postgres redis
```

## Stop

```bash
docker compose down
```

## Stop and Remove All Data

```bash
docker compose down -v
```

`-v` deletes the PostgreSQL, Redis, `node_modules`, and document/product-media storage volumes. Use this to reset the environment (the app images are not rebuilt, so next start is fast).

## Rebuild After Dependency Changes

```bash
docker compose up -d --build
```

## Run a Command in a Container

```bash
docker compose exec api sh
docker compose exec postgres psql -U sabz -d sabz
docker compose exec redis redis-cli ping
```

## Run Database Migrations Manually

Migrations are applied automatically when the API container starts. To run them manually:

```bash
docker compose exec api pnpm --filter @sabz/api prisma:migrate
```

To open Prisma Studio:

```bash
docker compose exec api pnpm --filter @sabz/api prisma:studio
```

---

# How It Works

## Networking

All services share the default Compose network and resolve each other by service name:

- The API connects to PostgreSQL at `postgres:5432` and Redis at `redis:6379` (configured via the `environment` block in `docker-compose.yml`; these override the `localhost` values in `apps/api/.env`).
- Ports are published to the host so browsers and tools can reach each service.
- The admin app is served to the browser on `localhost:5173`; it calls the API at `http://localhost:3000/api` (`VITE_API_BASE_URL`).

## Hot Reload

- API: `nest start --watch` recompiles and restarts on change.
- Admin: Vite HMR updates the browser on change.
- Storefront: Next.js dev server recompiles on change.

File watching relies on the host bind mounts, so changes saved on the host are picked up immediately in the containers.

## Volumes

- `postgres_data`, `redis_data` — persistent data across restarts.
- `api_node_modules`, `admin_node_modules`, `storefront_node_modules` — keep the Linux-installed dependencies inside the containers, isolated from host `node_modules`.
- `api_documents` — persistent business document storage, mounted at `/app/.data/documents` in the API container (matches `DOCUMENT_STORAGE_DIR`, SS-038).
- `api_product_media` — persistent product media storage, mounted at `/app/.data/product-media` in the API container (matches `PRODUCT_MEDIA_STORAGE_DIR`, SS-105).

---

# Environment Variables

- Root `.env.example` — the single development environment contract; it documents every variable, its owning application, and how it is loaded. Copy it with `cp .env.example .env` if you want to override Compose defaults (the defaults work without it).
- A root `.env` is read only by Compose for `${VAR}` interpolation in `docker-compose.yml`; it is never injected into containers or read by the application frameworks on the host.
- `docker-compose.yml` passes each value to the relevant service through its `environment:` block, with `${VAR:-default}` fallbacks so the stack starts with zero configuration. `DATABASE_URL` is derived from the `POSTGRES_*` variables; `REDIS_HOST` is fixed at the Compose service name `redis`.
- `apps/api/.env` — used only when the API runs directly on the host. Inside Docker the Compose `environment:` block takes precedence (process environment wins over `.env` files in `@nestjs/config`).
- `apps/admin/.env` — optional; inside Compose, `VITE_API_BASE_URL` is set by the `environment:` block (default `http://localhost:3000/api/v1`). Copy `apps/admin/.env.example` to `apps/admin/.env` only if you run the admin outside Docker.
- `apps/storefront/.env.local` — optional; the storefront falls back to `http://localhost:3000/api/v1` in code, so no file is required.

---

# Common Troubleshooting

## Port Already in Use

```bash
docker compose ps
```

If a host process occupies a published port, either stop it or change the left-hand side of the `ports` mapping (e.g. `"3002:3001"` → `"3003:3001"`).

> The storefront listens on port 3001 inside its container; it is published on host port 3002 because the commonly-used 3001 may already be taken by other local tools.

## PostgreSQL Not Ready / API Keeps Restarting

The API depends on healthy Postgres and Redis before starting. If a stale volume contains an invalid state:

```bash
docker compose down -v
docker compose up -d --build
```

## Prisma Client Not Generated

```bash
docker compose exec api pnpm --filter @sabz/api prisma:generate
```

## Missing or Incompatible Dependencies After a pnpm Change

The `node_modules` volumes cache the image dependencies. After editing `package.json` or `pnpm-lock.yaml`, rebuild:

```bash
docker compose up -d --build
```

If the containers still use stale dependencies:

```bash
docker compose down -v
docker compose up -d --build
```

## Storefront/Admin Changes Not Reflected

Hot reload relies on host file watching. On Windows/macOS this can be delayed for many files. Confirm the bind mounts are in place (`docker compose ps` → check the service uses the app image), then check the service logs for watch errors. Restarting the service clears watch state:

```bash
docker compose restart storefront
```

## Docker Desktop Not Running

Start Docker Desktop first, then re-run the commands. `docker compose ps` returning nothing usually means the Docker daemon is not running.

## Prisma OpenSSL Warning on Start

The API may log `Prisma failed to detect the libssl/openssl version`. This is a known message on `node:slim` images and is harmless here — the health endpoint still reports the database connection as OK. No action is required.

## Resetting Everything

```bash
docker compose down -v
docker compose up -d --build
```

This recreates all containers and volumes from scratch.
