# Production Deploy Runbook

> SS-245 (Stage 3 finale, master plan §6). Scope: production environment
> checklist, deploy procedure, monitoring wiring, rollback, and the
> topology decisions deferred to SS-245 by SS-244A (see
> `docs/04-database/backup.md` for the backup/restore runbook).

## 1. Topology decisions (recorded 2026-10-02, SS-245)

| Decision | Choice | Rationale |
|---|---|---|
| Deployment shape | Single host, Docker Compose (same layout as the dev stack, hardened per §2) | Matches the operational skill available at launch; every service is stateless except Postgres/media/documents |
| API replicas | **One replica at launch.** Multi-replica is *declared safe*: SS-244B moved throttler storage to Redis, so no in-memory session/throttle state remains | Scaling out needs only `--scale api` plus a shared Postgres and Redis — no code change. Not exercised under load for launch; revisit on demand |
| Redis persistence | **Ephemeral (no AOF/RDB)** | Redis holds OTP codes, OTP attempt/rate counters, and throttle buckets only — all recreatable. Persistence would add ops surface with no RPO gain; `redis_data` loss = users re-request OTPs |
| WAL/PITR | **Deferred, with an explicit trigger**: adopt only if the client requires RPO < 24h | Current posture (daily 03:00 UTC `pg_dump`, RPO ≤ 24h, RTO ≤ 2h per `backup.md`) is accepted for launch. WAL archiving needs `archive_command` + base-backup + restore tooling — a dedicated ticket when triggered |
| Process flags | `NODE_ENV=production` on the API | Hard gates: Swagger UI off, seed script refuses to run, and the deterministic dev OTP `123456` is dead (hard-coded `NODE_ENV === 'development'` gate in `OtpService`) |
| Frontend hostnames | Admin and storefront **must be reachable as distinct hostnames** (e.g. `admin.example.ir` vs `example.ir`) | The API refresh cookie is host-scoped to the API origin; two frontends sharing it in one browser overwrite each other's session (#290). Distinct hostnames are the launch mitigation |

## 2. Production environment checklist

Values below mirror the four `.env.example` files (root contract +
`apps/api`, `apps/admin`, `apps/storefront`). Root `.env` drives Compose
interpolation; `apps/*/.env` are read by host-native processes only.

### Must override (development defaults are public in the repo)

| Variable | Where | Production value |
|---|---|---|
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | api / root | `openssl rand -hex 48` each, distinct |
| `POSTGRES_PASSWORD` (+ derived `DATABASE_URL`) | root / compose | Long random, URL-safe (`openssl rand -hex 24`); keep `apps/api/.env` in sync if used |
| `REVALIDATE_TOKEN` | root (shared by api + storefront) | Long random; single source — compose passes it to both sides |
| `CORS_ORIGINS` | api / root | The two public frontend origins, no localhost entries |
| `VITE_API_BASE_URL` | admin / root | `https://<public-api-origin>/api/v1` (Vite inlines at **build time** — rebuild the admin image after changing) |
| `NEXT_PUBLIC_API_BASE_URL` | storefront | `https://<public-api-origin>/api/v1` (inlined at **build time**) |
| `NEXT_PUBLIC_SITE_URL` | storefront | Public storefront origin (OG/canonical `metadataBase`) |
| `TOROB_JWT_AUDIENCE` | api / root | The public API origin **as Torob sees it** |
| `TOROB_FEED_STOREFRONT_BASE_URL` / `TOROB_FEED_API_BASE_URL` | api / root | Public storefront / API origins (absolute `page_url`s in the feed) |
| `TRUST_PROXY` | api / root | `true` (or the hop count/CIDR) when a reverse proxy terminates TLS — per-IP OTP/throttle limits are only as good as the observed client IP |
| `NODE_ENV` | api (compose pins it) | `production` — see the hard gates in §1 |
| `DEV_ADMIN_MOBILE` | api / root | **Unset** — the seed refuses to run in production anyway |

### Business flags (review before go-live)

| Variable | Launch value | Note |
|---|---|---|
| `PAYMENTS_ONLINE_ENABLED` | `false` | SS-234B (gateway) is deferred until PSP credentials arrive; never enable without server-side callback verification |
| `COD_ENABLED` | `true` | Cash on delivery is the only live payment method |
| `SHIPPING_TIPAX_ENABLED` / `_FEE`, `SHIPPING_POST_*`, `SHIPPING_LOCAL_*`, `SHIPPING_PICKUP_*` | As the client decides | Flat Rial fees; unset fee = 0 (never trust client-sent money — totals resolve server-side) |
| `THROTTLE_TTL_MS` / `THROTTLE_LIMIT` | `60000` / `100` (defaults) | Per-route auth limits (SS-244A) sit below this on purpose; raise the global only with evidence |
| `NOTIFICATIONS_SMS_ENABLED` | `false` | SMS is a log-only stub until a provider ticket lands |
| `BACKUP_DIR` / `BACKUP_RETENTION_DAYS` | Host path outside the repo / `14` | Host cron + `scripts/backup/postgres-backup.sh` (see `backup.md`) |
| `WATERMARK_*`, `FFMPEG_PATH` | Defaults | Watermarking on; FFmpeg is baked into the API image |

### Data prerequisites

1. Run all migrations (`prisma migrate deploy`) — never seed; the catalog is
   imported via the SS-206–208 runbook (`docs/07-development/import-runbook.md`).
   Exception: partner-tier reference data (#90) — run
   `pnpm --filter @sabz/api seed:reference` after the first `migrate deploy`
   (idempotent; inserts only missing default tiers, never modifies rows).
   Partner approval requires a non-empty `PartnerTier` table.
2. Create the first admin account out-of-band: request an OTP for the
   operator's mobile against the public API, verify, then grant the ADMIN
   role via a DB update reviewed by a second person (there is no seeded
   admin in production).
3. Media/documents volumes (`api_product_media`, `api_documents`) must be
   mounted **before** the API serves traffic, or product images 404.

## 3. Deploy procedure

```bash
# 0) Pre-deploy safety dump (also run by host cron nightly — see backup.md)
scripts/backup/postgres-backup.sh

# 1) Ship the new build
git fetch && git checkout <release-tag>        # tags pin deploys; digest-pin in compose for real immutability
docker compose build api admin storefront

# 2) Migrate (forward-only; never `migrate dev`, never reset)
docker compose run --rm api pnpm --filter @sabz/api exec prisma migrate deploy

# 3) Roll the services
docker compose up -d api admin storefront

# 4) Verify (smoke)
curl -f https://<api>/api/v1/health            # {"status":"ok","redis":"ok",...}
curl -f -o /dev/null -w '%{http_code}\n' https://<api>/api/v1/catalog/products?limit=1   # 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<api>/api/v1/torob/products -H 'Content-Type: application/json' -d '{}'   # 401 = route live + guarded
curl -f -o /dev/null -w '%{http_code}\n' https://<storefront>/   # 200
# admin: log in via OTP with the operator account and open /dashboard
```

Notes:

- `prisma migrate deploy` is the only migration path in production
  (`migrate dev` resets — the SS-235 lesson in the handoff).
- Migrations are forward-only; there is no `migrate down`. Rollback of a
  bad migration = restore the pre-deploy dump (§5).
- The storefront build inlines `NEXT_PUBLIC_*` — a value change without a
  rebuild ships stale config silently.

## 4. Monitoring

| Check | Mechanism | Cadence |
|---|---|---|
| API process + Redis | Compose healthcheck hits `GET /api/v1/health` (`{"status":"ok","redis":"ok"}`; 2s Redis ping timeout) | 15s, start-period 90s |
| Postgres | Compose healthcheck `pg_isready` | 5s |
| External availability | Uptime probe on `GET /api/v1/health` **and** the storefront home (any free uptime monitor; alert on 2 consecutive failures) | 1–5 min |
| Backups | Host cron appends to `/var/log/sabz-backup.log`; watch for missing daily dump + `du` on `BACKUP_DIR` | Daily |
| Restore readiness | Quarterly restore test into `sabz_restore_test` (procedure in `backup.md`; record the date there) | Quarterly |
| Disk space | Postgres volume + `BACKUP_DIR` (alerts before 80%) | Daily |
| Logs | `docker compose logs api/admin/storefront`; audit trail is queryable in the admin panel (گزارش فعالیت‌ها) | On call |

Known blind spot at launch: `/health` does not ping Postgres (it is a
process + Redis check). Postgres failure surfaces through the external
storefront/API probes and the compose `pg_isready` healthcheck instead.

## 5. Rollback

1. **App-only regression** (no schema change in the release): redeploy the
   previous image tag; no data action needed. Keep the last two release
   tags cached on the host.
2. **Schema-bearing release**: migrations are forward-only — roll back the
   images **and** restore the pre-deploy dump from step 0 of §3 into the
   live database (single-service restore, RTO ≤ 2h per `backup.md`).
   Accept losing the writes that happened between the dump and the
   rollback; re-import media snapshots alongside if the release touched
   volumes.
3. **Bad release already migrated**: do not hand-edit the Prisma
   `_prisma_migrations` table; restore-from-dump is the supported path.

## 6. Launch QA record

Execution results, findings triage, and the follow-up tickets live in
GitHub issue #288 (SS-245 Launch QA/UAT/deploy). The client-facing
acceptance checklist is `docs/07-development/admin-uat-checklist.md`.
