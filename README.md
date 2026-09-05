# Sabz System Platform

Enterprise e-commerce platform for electronics retail and wholesale.

The repository ships a complete, reproducible Docker development/demo environment: one command starts PostgreSQL, Redis, the NestJS API, the React admin panel, and the Next.js storefront with database migrations and required seed data applied automatically. No local Node.js, pnpm, PostgreSQL, or Redis installation is required.

---

## Documentation

| Section | Description |
|---------|-------------|
| [Product Vision](docs/00-overview/product-vision.md) | Vision, mission, and target audience |
| [Business Goals](docs/00-overview/business-goals.md) | Business objectives and success metrics |
| [Project Scope](docs/00-overview/project-scope.md) | Feature scope and requirements |
| [Roadmap](docs/00-overview/roadmap.md) | Product roadmap and phases |
| [Project Timeline](docs/01-planning/project-timeline.md) | Milestone-based delivery schedule |
| [Milestones](docs/01-planning/milestones.md) | Milestone objectives and deliverables |
| [Acceptance Criteria](docs/01-planning/acceptance-criteria.md) | Milestone acceptance criteria |
| [Product Backlog](docs/01-planning/product-backlog.md) | Prioritized feature backlog |
| [Software Requirements](docs/02-requirements/software-requirements-specification.md) | Full SRS document |
| [User Stories](docs/02-requirements/user-stories.md) | User stories by module |
| [Roles & Permissions](docs/02-requirements/roles-permissions.md) | Role-based access matrix |
| [Feature Specifications](docs/02-requirements/feature-specifications/) | Individual feature specs |
| [Architecture Document](docs/03-architecture/software-architecture-document.md) | Software architecture (SAD) |
| [Architecture Decisions](docs/03-architecture/architecture-decisions/) | ADRs |
| [System Context](docs/03-architecture/system-context.md) | System boundaries and actors |
| [Database Design](docs/04-database/database-design-specification.md) | Database schema (DDS) |
| [Entity Relationship Model](docs/04-database/entity-relationship-model.md) | Entity relationships |
| [Migrations Guide](docs/04-database/migrations-guide.md) | Database migration workflow |
| [API Specification](docs/05-api/api-specification.md) | REST API endpoints |
| [Authentication API](docs/05-api/authentication-api.md) | Auth API reference |
| [UML Diagrams](docs/06-uml/) | Use cases, domain model, flows |
| [Development Guide](docs/07-development/development-guide.md) | Local setup and project structure |
| [Docker Development Environment](docs/07-development/development-environment.md) | Containerized local development — deep dive |
| [Local Environment Setup](docs/07-development/local-environment.md) | Environment variable contract and host-native setup |
| [Coding Standards](docs/07-development/coding-standards.md) | Code style and conventions |
| [AI Development Workflow](docs/07-development/ai-development-workflow.md) | AI-assisted development process |
| [GitHub Workflow](docs/07-development/github-workflow.md) | Branch strategy and PR process |
| [Sprint 00](docs/08-sprints/sprint-00-foundation.md) | Foundation sprint |
| [Sprint 01](docs/08-sprints/sprint-01-authentication.md) | Auth & core features sprint |

---

## Quick Start

### Prerequisites

| Tool | Notes |
|------|-------|
| [Docker](https://docs.docker.com/get-docker/) | Docker Desktop (Windows/macOS) or Docker Engine (Linux) |
| Docker Compose v2 | Included with Docker Desktop; `docker compose version` to confirm |
| Git | To clone the repository |

**Node.js and pnpm are NOT required** — the entire stack runs inside containers.

### 1. Clone

```bash
git clone <repository-url>
cd sabz-system
```

### 2. Configure environment

```bash
cp .env.example .env
```

The committed defaults are safe development/demo values — the stack starts with **zero further configuration**. You only need to edit `.env` if you want to change ports, credentials, or the seeded admin mobile number (see [Environment Variables](#environment-variables)).

### 3. Start

```bash
docker compose up -d --build
```

### 4. Open

| Service | URL |
|---------|-----|
| Admin panel | http://localhost:5173 |
| Storefront | http://localhost:3002 |
| API | http://localhost:3000/api/v1 |
| API Swagger docs | http://localhost:3000/api/docs |

Log in to the admin with the credentials below.

---

## Demo Credentials (Development/Demo Only)

The API uses **mobile number + one-time code (OTP)** login — there are no passwords.

| Setting | Value |
|---------|-------|
| Admin URL | http://localhost:5173 |
| Mobile number | `+989170000001` |
| OTP code | `123456` |

Login flow: open the admin panel → enter the mobile number → request a code → enter the OTP.

These are seeded by the development seed and are **strictly for local development and customer demos**:

- The seed refuses to run unless `NODE_ENV=development` (pinned in `docker-compose.yml`) — it can never run in production.
- The deterministic OTP `123456` exists only when `NODE_ENV=development`; it is hard-coded and cannot be enabled in production via any environment variable.
- To use a different mobile number, set `DEV_ADMIN_MOBILE` in `.env` before the first start (must be a valid Iranian mobile number, e.g. `+989123456789`).

The storefront currently serves a placeholder catalog page; product data is created through the admin panel, not seeded.

---

## What Happens on First Startup

```text
docker compose up -d --build
        │
        ├─ Images build (first run only — several minutes:
        │    pnpm install, FFmpeg, workspace package builds)
        │
        ├─ PostgreSQL starts ── healthy check (pg_isready)
        ├─ Redis starts ─────── healthy check (redis-cli ping)
        │
        ├─ API container waits for both health checks, then:
        │    1. prisma generate  (Prisma client)
        │    2. prisma migrate deploy (applies all pending migrations)
        │    3. prisma db seed   (roles, dev admin, default warehouse — idempotent)
        │    4. nest start --watch
        │
        ├─ Admin dev server starts (Vite, hot reload)
        └─ Storefront dev server starts (Next.js, hot reload)
```

Subsequent `docker compose up -d` runs skip the build and are fast; migrations and seed re-run safely (both are idempotent no-ops when up to date).

---

## Service URLs and Ports

| Service | Host Port | Container | Purpose |
|---------|-----------|-----------|---------|
| Admin | **5173** | 5173 | React + Vite admin CMS |
| Storefront | **3002** | 3001 | Next.js customer storefront |
| API | **3000** | 3000 | NestJS REST API (`/api/v1`) |
| Swagger UI | 3000 | 3000 | `http://localhost:3000/api/docs` |
| PostgreSQL 16 | 5432 | 5432 | Database (user/pass/db: `sabz`/`sabz`/`sabz`) |
| Redis 7 | 6379 | 6379 | OTP, rate limiting, health checks |

---

## Common Commands

```bash
docker compose up -d --build     # Build (if needed) and start everything
docker compose up -d             # Start without rebuilding
docker compose ps                # Status + health of all services
docker compose logs -f           # Follow all logs
docker compose logs -f api       # Follow API logs (migrations/seed output appear here)
docker compose down              # Stop containers (data is kept)
docker compose down -v           # Stop and DELETE all data (database, media, documents)
```

Run a command inside a container:

```bash
docker compose exec api sh                                  # API shell
docker compose exec postgres psql -U sabz -d sabz           # SQL shell
docker compose exec redis redis-cli ping                    # Redis ping
docker compose exec api ffmpeg -version                     # Verify FFmpeg
```

### Database Lifecycle

Migrations and seed run automatically every time the API container starts (healthy Postgres is a hard dependency). To run them manually:

```bash
docker compose exec api pnpm --filter @sabz/api exec prisma migrate deploy
docker compose exec api pnpm --filter @sabz/api prisma:seed
docker compose exec api pnpm --filter @sabz/api prisma:studio   # Prisma Studio UI
```

The seed is **idempotent** (upsert-based) and safe to run any number of times. It creates exactly:

- The four system roles (`CUSTOMER`, `PARTNER`, `OPERATOR`, `ADMIN`)
- The development admin user (`DEV_ADMIN_MOBILE`) with the `ADMIN` role and a Persian profile
- The default warehouse (`DEFAULT`) required by inventory

### Database Reset (Destructive)

> **WARNING:** This deletes the local development database, seeded accounts, uploaded documents, and product media. There is no undo.

```bash
docker compose down -v
docker compose up -d --build
```

This is the first thing to try whenever the local environment seems corrupted: containers and volumes are removed, the database is recreated from zero, migrations are applied, and required seed data is restored.

---

## Persistence

| Data | Survives `docker compose down`? | Survives `docker compose down -v`? |
|------|--------------------------------|------------------------------------|
| PostgreSQL data (products, users, …) | Yes (`postgres_data` volume) | **No** |
| Product media binaries | Yes (`api_product_media` volume) | **No** |
| Partner documents binaries | Yes (`api_documents` volume) | **No** |
| Redis OTP/session state | Yes (`redis_data` volume) | **No** |
| Container-installed `node_modules` | Yes (per-app volumes) | **No** (restored on next start) |

OTP codes are intentionally ephemeral — losing Redis state never breaks login.

---

## Environment Variables

`cp .env.example .env` is the single setup step. The root `.env` is read **only by Docker Compose** for `${VAR}` interpolation; each service receives its values through the `environment:` blocks in `docker-compose.yml`. All defaults are safe development/demo values.

| Variable | Required | Purpose |
|----------|----------|---------|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Compose defaults | PostgreSQL credentials; `DATABASE_URL` is derived from these |
| `REDIS_HOST` / `REDIS_PORT` | Pinned | Redis connection inside the Compose network (`redis:6379`) |
| `REDIS_PASSWORD` | Optional | Only if you configure the Redis service with a password |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Dev defaults | Authentication token secrets — **use long random strings outside local development** |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | Dev defaults | Token lifetimes (`15m` / `30d`) |
| `CORS_ORIGINS` | Dev default | Comma-separated browser origins allowed to make credentialed requests (defaults cover admin + storefront as both `localhost` and `127.0.0.1`) |
| `THROTTLE_TTL_MS` / `THROTTLE_LIMIT` | Dev defaults | Global per-IP rate limiting |
| `TRUST_PROXY` | Optional | Reverse-proxy hops for correct client IP detection; leave empty when the API is reached directly |
| `DEV_ADMIN_MOBILE` | Dev default | Mobile number of the seeded development admin |
| `DOCUMENT_STORAGE_DRIVER` / `DOCUMENT_STORAGE_DIR` | Pinned | Partner document storage (`local` driver; pinned to the `api_documents` volume) |
| `PRODUCT_MEDIA_STORAGE_DRIVER` / `PRODUCT_MEDIA_STORAGE_DIR` | Pinned | Product media storage (`local` driver; pinned to the `api_product_media` volume) |
| `PRODUCT_MEDIA_TEMP_DIR` | Pinned | Upload staging directory (inside the media volume) |
| `PRODUCT_MEDIA_IMAGE_MAX_SIZE_BYTES` | Optional | Image upload cap (default 10 MB) |
| `PRODUCT_MEDIA_VIDEO_MAX_SIZE_BYTES` | Optional | Video upload cap (default 200 MB) |
| `PRODUCT_DESCRIPTION_IMAGE_MAX_SIZE_BYTES` | Optional | Rich-text inline image cap (default 5 MB) |
| `WATERMARK_*` | Dev defaults | Company watermarking (enabled, company name, logo/font asset paths, opacity, position, sizing) |
| `FFMPEG_PATH` | Dev default | FFmpeg binary used for video watermarking (installed in the API image) |
| `VITE_API_BASE_URL` | Dev default | API base URL as seen by the admin in the browser |
| `API_PROXY_TARGET` | Dev default | Admin dev-server proxy target (`http://api:3000` inside Compose) |
| `NEXT_PUBLIC_API_BASE_URL` | Dev default | API base URL as seen by the storefront in the browser |

Host-native development (without Docker) uses per-app files instead: `apps/api/.env` (required — copy from `apps/api/.env.example`), `apps/admin/.env`, and `apps/storefront/.env.local` (both optional). See [Local Environment Setup](docs/07-development/local-environment.md).

Never commit `.env` files or real secrets — `.gitignore` already excludes them.

---

## Architecture

```text
                        Browser
                       /        \
                      /          \
        http://localhost:5173   http://localhost:3002
                Admin             Storefront
                (Vite)             (Next.js)
                      \            /
                       \          /
                http://localhost:3000
                     NestJS API  (/api/v1)
                     /          \
                    /            \
             postgres:5432    redis:6379
          (postgres_data)    (redis_data)
                    |
        /app/.data/product-media  (api_product_media volume)
        /app/.data/documents      (api_documents volume)
```

- All services share the default Compose network and resolve each other by service name (`postgres`, `redis`, `api`).
- Frontends are configured with **browser-facing** API URLs (`http://localhost:3000/...`), which are host-published ports — not Docker-internal hostnames.
- The API waits for `postgres` and `redis` to report **healthy** before running migrations, seed, and the server. The API itself is health-checked at `/api/v1/health`.

This setup serves both **development** (hot reload via bind mounts: edit source on the host, containers recompile) and **customer demos** (same single command; no database manipulation required). For production deployment, use different secrets, a production `CORS_ORIGINS`, and a proper build-based deployment — none of the development defaults above are production-safe.

---

## Troubleshooting

### Port already in use

`docker compose up` fails with *“port is already allocated”*. Find and stop the conflicting process, or change the **left-hand** port in `docker-compose.yml` (e.g. `"3002:3001"` → `"3003:3001"`). If you change the API port, also update `VITE_API_BASE_URL` / `NEXT_PUBLIC_API_BASE_URL` in `.env`.

### API keeps restarting

```bash
docker compose logs api
```

- *Authentication failed against database server* → the Postgres volume holds an old password; reset with `docker compose down -v && docker compose up -d --build`.
- *Seeding is development-only* → `NODE_ENV` was overridden; the Compose file pins it to `development`.
- *DEV_ADMIN_MOBILE must be set* → uncomment `DEV_ADMIN_MOBILE` in `.env`.
- Prisma may log `Failed to detect the libssl/openssl version` on startup — harmless on `node:slim` images; the health endpoint still works.

### Cannot log in to the admin

1. Confirm the seed ran: `docker compose logs api | grep -i seed` — look for `Seeded 4 roles…`. Without it, no admin exists.
2. Use exactly the seeded mobile (`+989170000001`, or `091700000001` — both are accepted) and OTP `123456`.
3. Each OTP code allows 3 verification attempts and expires after 2 minutes — request a new code and retry. OTP requests are limited to 3/minute per number and 15/minute per IP; after a 429, wait 60 seconds.
4. Open the browser dev tools → Network tab: the failing request's error tells you which case below applies.

### Admin page loads but API calls fail (CORS / network)

The browser calls `VITE_API_BASE_URL` directly — it must be a URL the **browser** can reach, never a Docker-internal hostname like `http://api:3000`.

- **Console shows a CORS error**: the origin in the browser's address bar is not in `CORS_ORIGINS`. Defaults cover `http://localhost:5173`, `http://localhost:3002`, `http://127.0.0.1:5173`, `http://127.0.0.1:3002`. If you browse from a different host (e.g. `http://<server-ip>:5173`), add that exact origin to `CORS_ORIGINS` in `.env` and set `VITE_API_BASE_URL` / `NEXT_PUBLIC_API_BASE_URL` to an API URL reachable from that browser (e.g. `http://<server-ip>:3000/api/v1`), then `docker compose up -d` to apply.
- **Connection refused / timeout**: the API is not up — check `docker compose ps` and `docker compose logs api`.
- On Windows, a WSL relay can hold the IPv6 loopback (see the `localhost` hangs entry below) — try `http://127.0.0.1:<port>`.

### Database seems corrupted or migrations fail

```bash
docker compose down -v
docker compose up -d --build
```

### Dependency changes not picked up

`node_modules` live in named volumes. After editing any `package.json` or `pnpm-lock.yaml`:

```bash
docker compose down -v
docker compose up -d --build
```

### Media upload fails

- Uploads stream to `PRODUCT_MEDIA_TEMP_DIR` inside the media volume; caps are 10 MB (images), 200 MB (videos), 5 MB (inline description images).
- Verify the volume is mounted: `docker compose exec api ls /app/.data/product-media`.
- A restart never deletes media; only `docker compose down -v` does.

### Video watermarking fails

- FFmpeg is installed in the API image: verify with `docker compose exec api ffmpeg -version`.
- The logo/font assets ship under `apps/api/assets/watermark/` and are bind-mounted into the container.

### First build is slow or file watching is delayed

First build downloads images, installs dependencies, and compiles — several minutes is normal. Hot-reload file watching on Windows/macOS can lag under heavy I/O; `docker compose restart api` (or `storefront`) clears watch state.

### Windows: `localhost` hangs for a published port (HTTP:000 in curl)

A WSL relay process (`wslrelay.exe`) can hold the IPv6 loopback (`[::1]:<port>`) after containers are recreated, so `localhost` resolves to it instead of Docker's proxy. Fix: use `http://127.0.0.1:<port>` directly, or restart Docker Desktop / run `wsl --shutdown` and reopen Docker Desktop. Browsers usually fail over automatically, but CLI tools that prefer IPv6 will hang.

---

## Running Without Docker

```bash
pnpm install                       # pnpm 11 (see package.json packageManager); Node 22 (.nvmrc)
cp .env.example .env               # optional — only overrides Docker Compose values
cp apps/api/.env.example apps/api/.env
docker compose up -d postgres redis

pnpm --filter @sabz/api prisma:migrate
pnpm dev                           # API :3000, admin :5173, storefront :3001
```

FFmpeg must be installed on the host for video watermarking. See the [Development Guide](docs/07-development/development-guide.md) for details.

---

## Technology Stack

- **Backend**: NestJS, TypeScript, PostgreSQL 16, Prisma, Redis, FFmpeg (media watermarking)
- **Storefront**: Next.js, React, Tailwind CSS
- **Admin**: React, TypeScript, Tailwind CSS, Catalyst UI Kit (Persian-first, RTL)

---

## AI Development

See [AGENTS.md](AGENTS.md) for AI-assisted development instructions.
