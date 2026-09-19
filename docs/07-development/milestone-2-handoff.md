# Milestone 2 — Execution Handoff to OpenCode

Date: 2026-09-20. Owner decision: remaining Milestone 2 issues are implemented
by **OpenCode** (ZCode is out of quota). This document gives OpenCode
everything needed to continue without re-deriving context.

---

## 1. Where things stand

Plan: `docs/01-planning/milestone-2-plan.md` (approved, binding decisions at
the end of the document). Feature spec:
`docs/02-requirements/feature-specifications/storefront-catalog.md`.

GitHub milestone: **"Milestone 2 — Storefront Catalog Experience"** (milestone
#4). Issues SS-119..SS-131 = GitHub issues #152..#164.

| Issue | GitHub | State |
| --- | --- | --- |
| SS-119 catalog contract + types | #152 | ✅ merged (#165/#166) |
| SS-120/121/122 public catalog API | #153–#155 | ✅ merged (#169, one PR) |
| SS-123 public media serving | #156 | ✅ merged (#168, security-reviewed) |
| SS-129 media thumbnails | #162 | ✅ merged (#170) |
| SS-124–128 storefront UI | #157–#161 | 🔶 **PR #171 open** (includes a CI fix — merge first) |
| SS-131 demo seed | #164 | ⬜ **next up — the last functional issue** |
| SS-130 stockQuantity cleanup | #163 | optional, after acceptance |

**Do this first:** review + merge PR #171, then implement SS-131 per its issue
body and §3 below, then run the acceptance test (§5).

## 2. Working conventions (enforced by AGENTS.md + this milestone)

- Branches `feat/ss-xxx-...`; commits `feat(scope): ...` referencing the issue
  (`Closes #164`).
- Before every push: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
  (Node 22 + pnpm 11.3; CI mirrors this plus an E2E/Integration job).
- Backend tests: `DATABASE_URL="postgresql://sabz:sabz@localhost:5432/sabz_test?schema=public"
  REDIS_HOST=localhost REDIS_PORT=6379 NODE_ENV=test
  JWT_ACCESS_SECRET=dev_access_secret_change_me
  JWT_REFRESH_SECRET=dev_refresh_secret_change_me
  pnpm --filter @sabz/api test:e2e` (and `test:integration`). Create the
  `sabz_test` database first (`docker exec sabz-postgres psql -U sabz -c
  "CREATE DATABASE sabz_test"`) and `prisma migrate deploy` into it. This
  mirrors CI exactly and never touches the dev database.
- E2E suites follow `apps/api/test/*.e2e-spec.ts` patterns — copy the setup
  helpers (roles/users/brand/category/product seeding) from
  `public-catalog.e2e-spec.ts`.

## 3. SS-131 — demo seed from sabzsistem.com (the next issue)

Full requirements are in issue #164. Key constraints, repeated here because
they are binding:

1. **Source**: the customer's live WooCommerce site sabzsistem.com — import
   the category tree (کالای دیجیتال + children), a small representative set of
   real product titles/models per category, brand names, current prices.
   Author **committed JSON fixtures + a handful of bundled sample images**
   under `apps/api/prisma/seed-catalog/` — do NOT scrape at boot time.
2. **⚠ Prices on the live site are Rial; the storefront contract is Toman —
   divide by 10 when authoring fixtures.** Spot-check a few against the site.
3. **Media**: create `ProductMedia` rows THROUGH the media service
   (`MediaService.upload`) so watermarking + thumbnails (SS-129) are applied
   exactly as in production; never hand-place files in the storage volume.
   For seed data this means uploading the bundled sample images through the
   service inside the seeder (construct the service or route through the
   app context — `apps/api/prisma/bootstrap.ts` shows how seed-side Prisma
   access is done today).
4. Idempotent; every product `PUBLISHED` with a primary image; include at
   least one multi-variant product and one video-bearing product; respect the
   dev-only seed gate.
5. Acceptance: fresh `docker compose up` → storefront home shows category nav
   with counts + latest products; listing filters/sorts work; detail page
   renders gallery + rich text + availability; admin spot-check unchanged.

## 4. Environment gotchas learned the hard way (all verified)

- **No system Node on the host** — `export
  PATH="$HOME/.local/opt/node-v22.21.1-linux-x64/bin:$PATH"` before any pnpm
  command. Docker daemon: use `docker context use default` if the CLI points
  at the dead Docker Desktop socket.
- **The running API container writes root-owned `apps/api/dist`** — before a
  host build: `docker exec sabz-api sh -c "rm -rf /app/apps/api/dist"`.
- **`nest --watch` restart races** surface as `EADDRINUSE :::3000` in
  `docker logs sabz-api` — `docker compose restart api`.
- **Storefront `node_modules` is a Docker volume** — new dependencies require
  `docker exec sabz-storefront pnpm install` (after the host lockfile update)
  and a `docker compose restart storefront`.
- **Server-side API resolution**: storefront server components fetch through
  `API_INTERNAL_BASE_URL` (`http://api:3000/api/v1` in compose) because the
  browser-facing URL is unreachable inside the container.
- **Catalog pages are `force-dynamic`** — build-time prerendering would fail
  when the API is unreachable (this was the CI failure on PR #171).
- **`generateSlug` strips Persian characters** — seeded/fixture product names
  need unique ASCII parts or slugs collide (409). `Math.random()`-style dots
  break the detail-slug validation pipe — use `[a-z0-9-]` suffixes.
- **The API container's `nest --watch` hot-reloads mounted source** — backend
  changes are live immediately; restart only if `EADDRINUSE` appears.
- **Admin UI + Playwright**: locator clicks time out on the admin app (ambient
  animation never settles); use coordinate clicks. Storefront is fine.

## 5. Milestone acceptance test (after SS-131)

Run the End-to-End Acceptance Test in
`docs/01-planning/milestone-2-plan.md` (§ End-to-End Acceptance Test) on a
fresh `docker compose up`: seed → storefront home/category/listing/detail →
media + thumbnails served with immutable cache headers → draft/archived
products 404 → inventory reflected → admin spot-check → `docker compose down
&& up` persistence. Also verify CI green on the SS-131 PR.

## 6. Optional cleanup (SS-130)

Remove the legacy `ProductVariant.stockQuantity` column only AFTER auditing
admin variant flows; the catalog/inventory code already never reads it.
